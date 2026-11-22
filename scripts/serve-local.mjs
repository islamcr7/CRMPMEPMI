// Démarre la version de production en local (comme sur un serveur) :
// mode production, migrations, données de démo si la base est vide, puis l'API
// qui sert aussi l'interface compilée. Usage : npm run deploy:local
// Port : 8080 par défaut (modifiable avec la variable PORT_LOCAL).
import { spawn } from 'node:child_process';

const port = process.env.PORT_LOCAL ?? '8080';
const env = { ...process.env, NODE_ENV: 'production', API_PORT: port };

console.log(`\nCRM PME (production locale) → http://localhost:${port}\n`);

// Commande fixe (aucun argument externe) : shell requis pour trouver npm sous Windows
const child = spawn('npm run start:prod', { env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
