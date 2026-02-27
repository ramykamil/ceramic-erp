const axios = require('axios');

async function testSorting() {
    try {
        console.log('Testing nbcolis sorting DESC (TotalQty 1, limit 5):');
        const res1 = await axios.get('http://localhost:5000/api/v1/products?limit=5&page=1&sortBy=nbcolis&sortOrder=DESC');
        res1.data.data.forEach((p, i) => console.log(`${i + 1}. ${p.productname} - Colis: ${p.nbcolis}`));

        console.log('\nTesting valeur sorting DESC (TotalQty 1, limit 5):');
        const res2 = await axios.get('http://localhost:5000/api/v1/products?limit=5&page=1&sortBy=valeur&sortOrder=DESC');
        res2.data.data.forEach((p, i) => {
            const valeur = Number(p.totalqty) * Number(p.prixachat);
            console.log(`${i + 1}. ${p.productname} - Valeur Achat: ${valeur}`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

testSorting();
