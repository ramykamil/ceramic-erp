const fs = require('fs');
try {
    const buf = fs.readFileSync('affected_since_april_6.txt');
    console.log('Buffer length:', buf.length);
    console.log('Hex (first 10):', buf.slice(0, 10).toString('hex'));
    
    // Maybe it's UTF-16LE
    const text16 = buf.toString('utf16le');
    console.log('UTF-16LE sample:', text16.substring(0, 100));
    
    // Maybe it's UTF-8
    const text8 = buf.toString('utf8');
    console.log('UTF-8 sample:', text8.substring(0, 100));
} catch (e) {
    console.error(e);
}
