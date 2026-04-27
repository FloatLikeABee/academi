package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/academi/backend/internal/auth"
	"github.com/academi/backend/internal/config"
	"github.com/academi/backend/internal/database"
)

type Service struct {
	cfg *config.Config
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float64       `json:"temperature"`
}

type ChatCompletionChoice struct {
	Index        int         `json:"index"`
	Message      ChatMessage `json:"message"`
	FinishReason string      `json:"finish_reason"`
}

type ChatCompletionResponse struct {
	Choices []ChatCompletionChoice `json:"choices"`
}

type SourceReference struct {
	Title string `json:"title"`
	Type  string `json:"type"`
}

type ChatRequest struct {
	Message string            `json:"message" binding:"required"`
	Context map[string]string `json:"context"`
}

type SummarizeRequest struct {
	Content string `json:"content" binding:"required"`
}

type GenerateGuideRequest struct {
	Topic string `json:"topic" binding:"required"`
	Steps int    `json:"steps"`
}

type ModerateRequest struct {
	Content string `json:"content" binding:"required"`
}

func NewService(cfg *config.Config) *Service {
	return &Service{cfg: cfg}
}

func (s *Service) Chat(userMessage string, context map[string]string) (string, error) {
	messages := []ChatMessage{
		{
			Role:    "system",
			Content: "You are Academi AI, an academic assistant. Provide clear, accurate, and well-structured responses. Use bullet points and numbered lists when helpful. Keep responses concise but thorough.",
		},
	}

	for key, value := range context {
		messages = append(messages, ChatMessage{
			Role:    "system",
			Content: fmt.Sprintf("Context - %s: %s", key, value),
		})
	}

	messages = append(messages, ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	reqBody := ChatCompletionRequest{
		Model:       s.cfg.AI.Model,
		Messages:    messages,
		MaxTokens:   s.cfg.AI.MaxTokens,
		Temperature: s.cfg.AI.Temperature,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", s.cfg.AI.BaseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.cfg.AI.APIKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	var completion ChatCompletionResponse
	if err := json.Unmarshal(body, &completion); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	return completion.Choices[0].Message.Content, nil
}

func (s *Service) ChatHandler(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := auth.GetUserID(c)
	if req.Context == nil {
		req.Context = make(map[string]string)
	}
	req.Context["user_id"] = userID

	settingsData, _ := database.Get([]byte("settings:" + userID))
	if settingsData != nil {
		var settings map[string]interface{}
		json.Unmarshal(settingsData, &settings)
		if tone, ok := settings["ai_tone"].(string); ok {
			req.Context["tone"] = tone
		}
		if depth, ok := settings["ai_depth"].(string); ok {
			req.Context["depth"] = depth
		}
	}

	response, err := s.Chat(req.Message, req.Context)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"response": response,
		"sources": []SourceReference{
			{Title: "Academi Knowledge Base", Type: "internal"},
		},
	})
}

func (s *Service) SummarizeHandler(c *gin.Context) {
	var req SummarizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	summary, err := s.Summarize(req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"summary": summary})
}

func (s *Service) GenerateGuideHandler(c *gin.Context) {
	var req GenerateGuideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Steps <= 0 {
		req.Steps = 7
	}

	guide, err := s.GenerateGuide(req.Topic, req.Steps)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"guide": guide})
}

func (s *Service) ModerateHandler(c *gin.Context) {
	var req ModerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	approved, reason, err := s.ModerateContent(req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"approved": approved,
		"reason":   reason,
	})
}

func (s *Service) Summarize(content string) (string, error) {
	return s.Chat("Summarize the following in 2-3 sentences: "+content, nil)
}

func (s *Service) GenerateGuide(topic string, steps int) (string, error) {
	prompt := fmt.Sprintf("Create a step-by-step learning guide for '%s' with %d steps. Return as a numbered list with clear, actionable steps. Each step should be 1-2 sentences.", topic, steps)
	return s.Chat(prompt, nil)
}

func (s *Service) ModerateContent(content string) (bool, string, error) {
	prompt := fmt.Sprintf("Evaluate the following content for academic appropriateness. Respond with 'APPROVED' if acceptable, or 'FLAGGED: <reason>' if not.\n\nContent: %s", content)

	result, err := s.Chat(prompt, nil)
	if err != nil {
		return true, "", err
	}

	isApproved := strings.HasPrefix(strings.ToUpper(result), "APPROVED")
	return isApproved, result, nil
}

func (s *Service) SearchDocs(query string, tone string, depth string) (string, error) {
	docContext, _ := database.Get([]byte("docs_index"))
	context := map[string]string{
		"tone":  tone,
		"depth": depth,
	}
	if docContext != nil {
		context["available_docs"] = string(docContext)
	}

	return s.Chat("Find relevant information for this query: "+query, context)
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	ai := r.Group("/ai")
	{
		ai.POST("/chat", s.ChatHandler)
		ai.POST("/summarize", s.SummarizeHandler)
		ai.POST("/generate-guide", s.GenerateGuideHandler)
		ai.POST("/moderate", s.ModerateHandler)
	}
}
