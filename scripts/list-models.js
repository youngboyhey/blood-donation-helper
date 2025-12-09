import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        // The SDK doesn't have a direct listModels method on the client instance in some versions,
        // but we can try to use the model manager if exposed, or just try to fetch via REST if SDK fails.
        // Actually, for the Node SDK, we might not have a direct listModels helper easily accessible 
        // without digging into the internal API. 
        // Let's try a raw fetch to the API endpoint which is more reliable for debugging.

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("No API key found.");
            return;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(model => {
                console.log(`- ${model.name} (${model.displayName})`);
                console.log(`  Supported generation methods: ${model.supportedGenerationMethods}`);
            });
        } else {
            console.log("No models found or error:", data);
        }

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
