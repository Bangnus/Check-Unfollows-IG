// const fetch = require('node-fetch'); // Use global fetch in Node 18+

async function testAPI() {
    const url = 'http://localhost:3000/api/instagram/notfollowingback';
    
    // Replace with your actual credentials
    const payload = {
        username: "anxs_ov", 
        password: "anxs_ov12345",
        // clientuser: "TARGET_USERNAME" // Optional: defaults to username if not provided
    };

    console.log("🚀 Sending request to API...");
    console.log("Payload:", payload);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("📦 Response Status:", response.status);
        console.log("📄 Response Data:", JSON.stringify(data, null, 2));

    } catch (error) {
        console.error("🚨 Error:", error);
    }
}

testAPI();
