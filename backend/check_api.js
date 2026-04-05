const http = require('http');

http.get('http://localhost:5000/api/v1/orders', {
    headers: {
        // We need auth token, but let's see if we can hack around it.
        // Let me check if there's any public route ... wait, I will write a mock controller check.
    }
}, res => { /* ... */ });
