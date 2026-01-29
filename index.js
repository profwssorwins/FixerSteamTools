const inquirer = require('inquirer');
const chalk = require('chalk');
const axios = require('axios');
const ora = require('ora');
const cliProgress = require('cli-progress');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

const API_BASE = 'https://americankeyback.squareweb.app/api';
const STEAMCMD_API_URL = 'https://api.steamcmd.net/v1/info';
const MANIFESTHUB_API_URL = 'https://api.manifesthub1.filegear-sg.me/manifest';

console.clear();
console.log(chalk.blue.bold('\n╔════════════════════════════════════════╗'));
console.log(chalk.blue.bold('║     AMERICANKEY AUTO-FIXER v3.0        ║'));
console.log(chalk.blue.bold('╚════════════════════════════════════════╝\n'));

async function main() {
    try {
        const spinner = ora(chalk.yellow('Inicializando...')).start();
        spinner.stop();
        const { apiKey } = await inquirer.prompt([
            {
                type: 'input',
                name: 'apiKey',
                message: chalk.cyan('Digite sua ManifestHub API Key:'),
                validate: (input) => input.trim().length > 10 || 'API Key inválida (muito curta)'
            }
        ]);

        const manifestHubKey = apiKey.trim();

        const steamPath = await findSteamPath();
        if (!steamPath) {
            spinner.fail(chalk.red('Steam não encontrada!'));
            process.exit(1);
        }
        spinner.succeed(chalk.green(`Steam: ${steamPath}`));

        
        const stplugPath = path.join(steamPath, 'config', 'stplug-in');
        if (!await fs.pathExists(stplugPath)) {
            console.log(chalk.red(`\nPasta stplug-in não encontrada.`));
            process.exit(1);
        }

        spinner.text = chalk.yellow('Escaneando jogos...');
        const files = await fs.readdir(stplugPath);
        const luaFiles = files.filter(f => f.endsWith('.lua'));

        if (luaFiles.length === 0) {
            spinner.fail(chalk.red('Nenhum jogo encontrado (sem .lua)'));
            process.exit(1);
        }

        const detectedGames = [];
        for (const file of luaFiles) {
            const appId = file.replace('.lua', '');
            if (/^\d+$/.test(appId)) {
                const name = await getGameName(appId);
                detectedGames.push({ name, appId, value: appId });
            }
        }
        spinner.stop();

        if (detectedGames.length === 0) {
            console.log(chalk.red('Nenhum jogo válido detectado.'));
            process.exit(1);
        }

        const { selectedGames } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'selectedGames',
                message: chalk.yellow('Selecione os jogos para corrigir (Espaço para marcar):'),
                choices: detectedGames,
                validate: (answer) => {
                    if (answer.length < 1) {
                        return 'Você deve escolher pelo menos um jogo.';
                    }
                    return true;
                }
            }
        ]);

        console.log(chalk.cyan(`\n✅ ${selectedGames.length} jogos selecionados.`));

        for (let i = 0; i < selectedGames.length; i++) {
            const appId = selectedGames[i];
            const gameInfo = detectedGames.find(g => g.appId === appId);

            console.log(chalk.blue.bold(`\n[${i + 1}/${selectedGames.length}] Iniciando: ${gameInfo.name} (${appId})`));

            if (i > 0) {
                console.log(chalk.yellow('\n⏳ Aguardando 1 minuto para evitar bloqueio da API...'));
                await new Promise(resolve => {
                    let seconds = 60;
                    const timer = setInterval(() => {
                        process.stdout.write(`\rRestante: ${seconds}s   `);
                        seconds--;
                        if (seconds < 0) {
                            clearInterval(timer);
                            resolve();
                            process.stdout.write('\n');
                        }
                    }, 1000);
                });
            }

            await processGame(appId, steamPath, manifestHubKey);
        }

        console.log(chalk.cyan('\n🔄 Reiniciando Steam...'));
        try {
            await restartSteam();
            console.log(chalk.green('✅ Steam reiniciada!'));
        } catch (e) {
            console.log(chalk.yellow('⚠️ Reinicie a Steam manualmente.'));
        }

        console.log(chalk.green.bold('\n✨ Processo Finalizado! ✨\n'));

    } catch (error) {
        console.error(chalk.red('\n❌ Erro fatal:'), error.message);
        process.exit(1);
    }
}

async function processGame(appId, steamPath, apiKey) {
    const spinner = ora(`Processando ${appId}...`).start();

    try {
        const luaPath = path.join(steamPath, 'config', 'stplug-in', `${appId}.lua`);
        const content = await fs.readFile(luaPath, 'utf8');
        const matches = [...content.matchAll(/addappid\s*\(\s*(\d+)\s*,\s*\d+\s*,\s*"[a-fA-F0-9]+"/g)];
        const depotIds = [...new Set(matches.map(m => m[1]))];

        if (depotIds.length === 0) {
            spinner.fail(chalk.red('Nenhum depot encontrado no Lua.'));
            return;
        }

        spinner.text = `Depots encontrados: ${depotIds.join(', ')}. Buscando Manifest IDs...`;

        const appInfoResponse = await axios.get(`${STEAMCMD_API_URL}/${appId}`, { timeout: 30000 });
        const appData = appInfoResponse.data;

        if (appData.status !== 'success') {
            spinner.fail(chalk.red('Falha ao obter AppInfo da SteamCMD.'));
            return;
        }

        const depotsObj = appData.data[appId].depots;
        let successCount = 0;

        for (const depotId of depotIds) {
            spinner.text = `Processando Depot ${depotId}...`;

            let manifestId = null;
            if (depotsObj[depotId] && depotsObj[depotId].manifests && depotsObj[depotId].manifests.public) {
                manifestId = depotsObj[depotId].manifests.public.gid;
            }

            if (!manifestId) {
                console.log(chalk.yellow(`\n    ⚠ Sem manifest ID público para Depot ${depotId}`));
                continue;
            }

            let retries = 10;
            let success = false;

            while (retries > 0 && !success) {
                try {
                    const url = `${MANIFESTHUB_API_URL}?apikey=${apiKey}&depotid=${depotId}&manifestid=${manifestId}`;
                    const response = await axios.get(url, {
                        responseType: 'arraybuffer',
                        timeout: 60000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });

                    const filename = `${depotId}_${manifestId}.manifest`;
                    const depotcachePath = path.join(steamPath, 'depotcache', filename);
                    const configDepotcachePath = path.join(steamPath, 'config', 'depotcache', filename);

                    await fs.ensureDir(path.dirname(depotcachePath));
                    await fs.ensureDir(path.dirname(configDepotcachePath));

                    await fs.writeFile(depotcachePath, response.data);
                    await fs.writeFile(configDepotcachePath, response.data);

                    successCount++;
                    console.log(chalk.green(`    ✔ ${filename} baixado.`));
                    success = true;

                } catch (err) {
                    const status = err.response ? err.response.status : 'unknown';

                    if (status === 429) {
                        console.log(chalk.yellow(`      ⚠️ Rate Limit (429). Aguardando 5s...`));
                        await new Promise(r => setTimeout(r, 5000));
                        continue;
                    }

                    retries--;
                    if (retries > 0) {
                        console.log(chalk.yellow(`      ⚠ Erro ${status}. Tentando novamente (${retries} restantes)...`));
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        console.log(chalk.red(`    ✖ Falha Final Depot ${depotId}: ${err.message}`));
                    }
                }
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        spinner.succeed(`Terminado. ${successCount} manifests instalados.`);

    } catch (error) {
        spinner.fail(`Erro: ${error.message}`);
    }
}

async function getGameName(appId) {
    try {
        const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`, { timeout: 3000 });
        if (response.data && response.data[appId] && response.data[appId].success) {
            return response.data[appId].data.name;
        }
    } catch (e) { }
    return `Unknown AppID ${appId}`;
}

async function findSteamPath() {
    const possiblePaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
        path.join(os.homedir(), 'Steam'),
        'D:\\Steam',
        'E:\\Steam'
    ];

    for (const steamPath of possiblePaths) {
        const configPath = path.join(steamPath, 'config');
        if (await fs.pathExists(configPath)) {
            return steamPath;
        }
    }

    return null;
}

async function getGameName(appId) {
    try {
        const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`, { timeout: 3000 });
        if (response.data && response.data[appId] && response.data[appId].success) {
            return response.data[appId].data.name;
        }
    } catch (e) {
    }
    return `AppID ${appId}`;
}

async function restartSteam() {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    try {
        await execPromise('taskkill /F /IM steam.exe');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const steamPath = await findSteamPath();
        if (steamPath) {
            const steamExe = path.join(steamPath, 'steam.exe');
            exec(`"${steamExe}"`);
        }
    } catch (error) {
    }
}

main();

