package docs

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/academi/backend/internal/auth"
	"github.com/academi/backend/internal/database"
	"github.com/academi/backend/internal/models"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

func (s *Service) CreateDoc(c *gin.Context) {
	var req models.CreateDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := auth.GetUserID(c)

	summary := req.AISummary
	if summary == "" && req.Content != "" {
		summary = req.Content
		if len(summary) > 320 {
			summary = summary[:320] + "…"
		}
	}
	size := req.Size
	if size == "" && req.Content != "" {
		size = fmt.Sprintf("%d", len(req.Content))
	}

	doc := models.Document{
		ID:         uuid.New().String(),
		Title:      req.Title,
		UploaderID: userID,
		Type:       req.Type,
		Size:       size,
		Thumbnail:  req.Thumbnail,
		Tags:       req.Tags,
		AISummary:  summary,
		Content:    req.Content,
		CreatedAt:  time.Now().Unix(),
	}

	if err := s.persistDoc(&doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create document"})
		return
	}

	c.JSON(http.StatusCreated, doc)
}

func (s *Service) persistDoc(doc *models.Document) error {
	data, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	if err := database.Set([]byte("doc:"+doc.ID), data); err != nil {
		return err
	}
	s.updateDocIndex()
	return nil
}

// SaveGenerated stores an AI-produced document (e.g. from chat). Tags may be nil.
func (s *Service) SaveGenerated(title, content, uploaderID string, tags []string) (*models.Document, error) {
	title = strings.TrimSpace(title)
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, fmt.Errorf("empty content")
	}
	if title == "" {
		title = "Untitled document"
	}
	if len(tags) == 0 {
		tags = []string{"#ai", "#document"}
	}
	summary := content
	if len(summary) > 320 {
		summary = summary[:320] + "…"
	}
	doc := &models.Document{
		ID:         uuid.New().String(),
		Title:      title,
		Content:    content,
		AISummary:  summary,
		UploaderID: uploaderID,
		Type:       "markdown",
		Size:       fmt.Sprintf("%d", len(content)),
		Tags:       tags,
		CreatedAt:  time.Now().Unix(),
	}
	if err := s.persistDoc(doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *Service) GetDoc(c *gin.Context) {
	docID := c.Param("id")

	data, err := database.Get([]byte("doc:" + docID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Document not found"})
		return
	}

	var doc models.Document
	json.Unmarshal(data, &doc)

	c.JSON(http.StatusOK, doc)
}

func (s *Service) ListDocs(c *gin.Context) {
	var docs []models.Document

	database.Iterate([]byte("doc:"), func(key, value []byte) error {
		var doc models.Document
		if err := json.Unmarshal(value, &doc); err == nil {
			docs = append(docs, doc)
		}
		return nil
	})

	c.JSON(http.StatusOK, docs)
}

func (s *Service) SearchDocs(c *gin.Context) {
	query := strings.ToLower(c.Query("q"))
	docType := c.Query("type")
	tag := c.Query("tag")

	var results []models.Document

	database.Iterate([]byte("doc:"), func(key, value []byte) error {
		var doc models.Document
		if err := json.Unmarshal(value, &doc); err != nil {
			return nil
		}

		match := true
		if query != "" {
			q := strings.ToLower(query)
			match = match && (strings.Contains(strings.ToLower(doc.Title), q) ||
				strings.Contains(strings.ToLower(doc.AISummary), q) ||
				strings.Contains(strings.ToLower(doc.Content), q) ||
				s.tagsContain(doc.Tags, q))
		}
		if docType != "" {
			match = match && strings.EqualFold(doc.Type, docType)
		}
		if tag != "" {
			match = match && s.tagsContain(doc.Tags, tag)
		}

		if match {
			results = append(results, doc)
		}
		return nil
	})

	resp := models.SearchResponse{
		Results: results,
		Total:   len(results),
		Query:   query,
	}

	c.JSON(http.StatusOK, resp)
}

func (s *Service) DeleteDoc(c *gin.Context) {
	docID := c.Param("id")

	if err := database.Delete([]byte("doc:" + docID)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Document not found"})
		return
	}

	s.updateDocIndex()
	c.JSON(http.StatusOK, gin.H{"message": "Document deleted"})
}

func (s *Service) tagsContain(tags []string, query string) bool {
	for _, tag := range tags {
		if strings.Contains(strings.ToLower(tag), query) {
			return true
		}
	}
	return false
}

func (s *Service) updateDocIndex() {
	var docs []models.Document

	database.Iterate([]byte("doc:"), func(key, value []byte) error {
		var doc models.Document
		if err := json.Unmarshal(value, &doc); err == nil {
			docs = append(docs, doc)
		}
		return nil
	})

	data, _ := json.Marshal(docs)
	database.Set([]byte("docs_index"), data)
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	docs := r.Group("/docs")
	{
		docs.POST("", s.CreateDoc)
		docs.GET("", s.ListDocs)
		docs.GET("/search", s.SearchDocs)
		docs.GET("/:id", s.GetDoc)
		docs.DELETE("/:id", s.DeleteDoc)
	}
}
