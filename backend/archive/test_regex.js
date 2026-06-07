const parseSqmPerPiece = (str) => {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    }
    return 0;
};
console.log('Result:', parseSqmPerPiece('ARIZONA CAPPUCCINO REC 20/75'));
