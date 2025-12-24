import { GoogleGenAI } from "@google/genai";
import { AiItem } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing");
    throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey });
};

export const queryRagAgent = async (
  query: string, 
  contextItems: AiItem[]
): Promise<{ text: string; usedContextIds: string[] }> => {
  
  // Mocking a retrieval step: Filter items that vaguely match keywords in the query
  // In a real app, this would be the vector search (FAISS)
  const relevantItems = contextItems.filter(item => 
    query.toLowerCase().includes(item.id.split('.')[0].toLowerCase()) ||
    query.toLowerCase().includes(item.type.toLowerCase()) ||
    item.l2_desc.toLowerCase().split(' ').some(word => query.toLowerCase().includes(word) && word.length > 4)
  ).slice(0, 3);

  // If no specific match, just take the top 2 to simulate "some" context
  const finalContext = relevantItems.length > 0 ? relevantItems : contextItems.slice(0, 2);

  const contextString = finalContext.map(item => `
---
ID: ${item.id}
TYPE: ${item.type}
LANGUAGE: ${item.language}
FILE: ${item.filePath}
DESCRIPTION (L2): ${item.l2_desc}
SOURCE (L0):
${item.l0_code}
---
`).join('\n');

  const systemPrompt = `
You are the "AiItem RAG Agent", an intelligent assistant capable of answering questions about a specific codebase (Polyglot: Python, TS, Go, etc.) based on retrieved context.

Here is the retrieved context (AiItems) relevant to the user's query:
${contextString}

Instructions:
1. Use the provided context to answer the user's question technically and precisely.
2. If the context explains the code, cite the function/class names.
3. If the context is insufficient, state that you don't have that information in the vectorized knowledge base.
4. Be concise and developer-focused.
5. Be mindful of the programming language indicated in the context.
`;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      config: {
        systemInstruction: systemPrompt,
      }
    });

    return {
      text: response.text || "No response generated.",
      usedContextIds: finalContext.map(i => i.id)
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      text: "Error connecting to the RAG brain. Please ensure your API Key is valid.",
      usedContextIds: []
    };
  }
};