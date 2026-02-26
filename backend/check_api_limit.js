require('dotenv').config();
const http = require('http');

http.get('http://localhost:5000/api/v1/products?limit=100000', (res) => {
    let rawData = '';
    res.on('data', chunk => { rawData += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(rawData);
            console.log('Success?', parsed.success);
            if (!parsed.success) {
                console.log('Message:', parsed.message);
                return;
            }
            console.log('Total items parsed:', parsed.data.length);
            const match = parsed.data.find(p => p.productcode?.includes('ALMERIA GRIS REC 60/60'));
            console.log('Match found in API response?', !!match);
            if (match) console.log(match);
        } catch (e) {
            console.error('Error parsing:', e.message);
            console.log('Raw:', rawData.substring(0, 200));
        }
    });
});
