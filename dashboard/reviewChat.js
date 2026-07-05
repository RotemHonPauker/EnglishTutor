import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { systemPrompt } from './systemPrompt.js';
import { handleToolCall } from './toolHandler.js';


/*
    1. A message gets added to conversationHistory
    2. The whole history gets sent to Claude along with the tools list
    3. Claude either replies with text (done) or calls a tool (keep going)
    4. If Claude calls a tool, toolHandler runs it, the result goes back to Claude, and Claude responds again
    5. This loop repeats until Claude stops calling tools and gives a text reply
    6. That text reply goes back to your browser

    The while loop handles step 4 — it keeps running as long as Claude keeps calling tools. 
    In practice this means Claude can fetch a phrase, propose changes, 
    and confirm a tag all in one turn without waiting for you in between.
*/

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const handleReviewMessage = async (userMessage, conversationHistory) => {
    conversationHistory.push({ role: 'user', content: userMessage });

    let response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: conversationHistory
    });

    while (response.stop_reason === 'tool_use') {
        conversationHistory.push({ role: 'assistant', content: response.content });

        const toolResults = [];

        for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            const result = await handleToolCall(block.name, block.input);
            toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: result
            });
        }

        conversationHistory.push({ role: 'user', content: toolResults });

        response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: systemPrompt,
            tools,
            messages: conversationHistory
        });
    }

    const assistantText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

    conversationHistory.push({ role: 'assistant', content: assistantText });

    return { reply: assistantText, history: conversationHistory };
};