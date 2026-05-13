package ai

import (
	"encoding/json"
	"log"
	"strings"
)

const businessPolishSystem = `You are a lightweight preprocessor for a business document assistant.

Given the user's latest message, decide if it is business-related: work, strategy, professional communication, clients, revenue, operations, startups, HR, proposals, meetings, contracts, product, marketing, finance in a business context, or similar.

Respond with ONLY a compact JSON object (no markdown fences), no other text:
{"business":true|false,"polished":"<string>"}

Rules:
- If business is true, "polished" must be a clear, concise rewrite of the user's intent in the SAME language as the user, suitable as the main task description for a business writing assistant. Preserve names, numbers, and constraints.
- If business is false, set "polished" to the exact original user message (verbatim).
- Never add preambles or explanations outside the JSON.`

// BusinessPipelineDocRef identifies a library document injected as RAG context.
type BusinessPipelineDocRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// BusinessPipelineMeta describes preprocess + RAG for clients (document agent mode).
type BusinessPipelineMeta struct {
	OriginalUserMessage string                   `json:"original_user_message"`
	PolishedUserMessage string                   `json:"polished_user_message,omitempty"`
	BusinessRelated     bool                     `json:"business_related"`
	RAGDocuments        []BusinessPipelineDocRef `json:"rag_documents,omitempty"`
	PolishError         string                   `json:"polish_error,omitempty"`
}

type polishJSON struct {
	Business bool   `json:"business"`
	Polished string `json:"polished"`
}

func extractJSONObject(raw string) string {
	raw = strings.TrimSpace(raw)
	if i := strings.Index(raw, "{"); i >= 0 {
		raw = raw[i:]
	}
	if j := strings.LastIndex(raw, "}"); j >= 0 && j < len(raw) {
		raw = raw[:j+1]
	}
	return raw
}

func parsePolishResponse(raw, fallback string) (bool, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false, fallback
	}
	var p polishJSON
	if err := json.Unmarshal([]byte(extractJSONObject(raw)), &p); err != nil {
		log.Printf("business polish JSON parse: %v", err)
		return false, fallback
	}
	if !p.Business {
		return false, fallback
	}
	out := strings.TrimSpace(p.Polished)
	if out == "" {
		return false, fallback
	}
	return true, out
}

func patchLastUserMessage(req *ChatRequest, newText string) {
	newText = strings.TrimSpace(newText)
	if newText == "" {
		return
	}
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if strings.EqualFold(strings.TrimSpace(req.Messages[i].Role), "user") && strings.TrimSpace(req.Messages[i].Content) != "" {
			req.Messages[i].Content = newText
			return
		}
	}
	if strings.TrimSpace(req.Message) != "" {
		req.Message = newText
	}
}

func resolvePolishProviderName(req ChatRequest) string {
	if v := strings.TrimSpace(req.PolishAIProvider); v != "" {
		return v
	}
	return strings.TrimSpace(req.AIProvider)
}

func (s *Service) polishIfBusinessQuery(providerName, userMessage string) (polished string, isBusiness bool, err error) {
	userMessage = strings.TrimSpace(userMessage)
	if userMessage == "" {
		return "", false, nil
	}
	provider, err := s.getProvider(providerName)
	if err != nil {
		return "", false, err
	}
	msgs := []ChatMessage{
		{Role: "system", Content: businessPolishSystem},
		{Role: "user", Content: userMessage},
	}
	maxTok := provider.MaxTokens
	if maxTok > 512 {
		maxTok = 512
	}
	temp := provider.Temperature
	if temp > 0.4 {
		temp = 0.3
	}
	raw, err := s.chatCompletion(provider, msgs, maxTok, temp)
	if err != nil {
		return "", false, err
	}
	isBiz, out := parsePolishResponse(raw, userMessage)
	if !isBiz {
		return userMessage, false, nil
	}
	return out, true, nil
}
