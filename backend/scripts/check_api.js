const http = require('http');

const options = {
    hostname: 'localhost',
    port: 5000, // Assuming default backend port
    path: '/api/v1/products?search=LUKE%20PERLA%20TERRE%20CUITE%2045%2F45',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Status Code:', res.statusCode);
            if (json.data && json.data.length > 0) {
                const product = json.data[0];
                console.log('API Product:', {
                    id: product.productid,
                    name: product.productname,
                    prixachat: product.prixachat
                });
            } else {
                console.log('Product not found in API response');
                console.log('Full Response:', data);
            }
        } catch (e) {
            console.error('Error parsing JSON:', e);
            console.log('Raw Data:', data);
        }
    });

});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
