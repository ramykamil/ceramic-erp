const http = require('http');

function login() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            username: 'admin',
            password: 'admin123' // Default from seed
        });

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/v1/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.token) resolve(json.token);
                    else reject('No token in login response: ' + data);
                } catch (e) { reject(e); }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

async function checkProduct() {
    try {
        const token = await login();
        console.log('Got token, checking product...');

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/v1/products?search=LUKE', // Search partial name
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // console.log('Full Response:', JSON.stringify(json, null, 2));

                    // Find our target product
                    const targetName = "LUKE PERLA TERRE CUITE 45/45";
                    const product = json.data.find(p => p.productname === targetName);

                    if (product) {
                        console.log('API Product Found:');
                        console.log(`ID: ${product.productid}`);
                        console.log(`Name: ${product.productname}`);
                        console.log(`PrixAchat (API): ${product.prixachat}`);
                        console.log(`PurchasePrice (API): ${product.purchaseprice}`);
                    } else {
                        console.log('Target product not found in search results');
                        console.log('Available products:', json.data.map(p => p.productname));
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                }
            });
        });

        req.on('error', (e) => console.error(e));
        req.end();

    } catch (e) {
        console.error('Login failed:', e);
    }
}

checkProduct();
