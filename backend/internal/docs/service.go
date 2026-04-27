package docs

import (
	"encoding/json"
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

	doc := models.Document{
		ID:         uuid.New().String(),
		Title:      req.Title,
		UploaderID: userID,
		Type:       req.Type,
		Size:       req.Size,
		Thumbnail:  req.Thumbnail,
		Tags:       req.Tags,
		CreatedAt:  time.Now().Unix(),
	}

	data, _ := json.Marshal(doc)
	if err := database.Set([]byte("doc:"+doc.ID), data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create document"})
		return
	}

	s.updateDocIndex()
	c.JSON(http.StatusCreated, doc)
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
			match = match && (strings.Contains(strings.ToLower(doc.Title), query) ||
				strings.Contains(strings.ToLower(doc.AISummary), query) ||
				s.tagsContain(doc.Tags, query))
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
