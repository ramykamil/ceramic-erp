const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
fs.writeFileSync('.env.backup', env);

const newEnv = env
    .replace(/DB_HOST=localhost/, 'DB_HOST=aws-0-eu-central-1.pooler.supabase.com')
    .replace(/DB_NAME=ceramic_erp/, 'DB_NAME=postgres')
    .replace(/DB_USER=postgres/, 'DB_USER=postgres.ugvioyruqoafvsqvnwiy')
    .replace(/DB_PASSWORD=postgres/, 'DB_PASSWORD="p3yf+XV7\'EMz^#"')
    .replace(/DB_PORT=5432/, 'DB_PORT=5432');

fs.writeFileSync('.env', newEnv);
console.log('Env updated to Supabase!');
