package guide

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/academi/backend/internal/database"
	"github.com/academi/backend/internal/models"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

func (s *Service) CreateGuide(c *gin.Context) {
	var req models.CreateGuideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	guide := models.Guide{
		ID:          uuid.New().String(),
		Title:       req.Title,
		Description: req.Description,
		Category:    req.Category,
		Icon:        req.Icon,
		Color:       req.Color,
		Steps:       req.Steps,
		CreatedAt:   time.Now().Unix(),
	}

	data, _ := json.Marshal(guide)
	if err := database.Set([]byte("guide:"+guide.ID), data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create guide"})
		return
	}

	c.JSON(http.StatusCreated, guide)
}

func (s *Service) GetGuide(c *gin.Context) {
	guideID := c.Param("id")

	data, err := database.Get([]byte("guide:" + guideID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guide not found"})
		return
	}

	var guide models.Guide
	json.Unmarshal(data, &guide)

	c.JSON(http.StatusOK, guide)
}

func (s *Service) ListGuides(c *gin.Context) {
	var guides []models.Guide

	database.Iterate([]byte("guide:"), func(key, value []byte) error {
		var guide models.Guide
		if err := json.Unmarshal(value, &guide); err == nil {
			guides = append(guides, guide)
		}
		return nil
	})

	c.JSON(http.StatusOK, guides)
}

func (s *Service) DeleteGuide(c *gin.Context) {
	guideID := c.Param("id")

	if err := database.Delete([]byte("guide:" + guideID)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guide not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Guide deleted"})
}

func (s *Service) GetProgress(c *gin.Context) {
	userID := c.Param("userId")
	guideID := c.Param("id")

	data, err := database.Get([]byte("progress:" + userID + ":" + guideID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Progress not found"})
		return
	}

	var progress models.UserGuideProgress
	json.Unmarshal(data, &progress)

	c.JSON(http.StatusOK, progress)
}

func (s *Service) UpdateProgress(c *gin.Context) {
	userID := c.Param("userId")
	guideID := c.Param("id")

	var req struct {
		StepID int  `json:"step_id" binding:"required"`
		Done   bool `json:"done"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var progress models.UserGuideProgress
	data, err := database.Get([]byte("progress:" + userID + ":" + guideID))
	if err != nil {
		progress = models.UserGuideProgress{
			UserID:         userID,
			GuideID:        guideID,
			CompletedSteps: []int{},
			StartedAt:      time.Now().Unix(),
		}
	} else {
		json.Unmarshal(data, &progress)
	}

	found := false
	for i, step := range progress.CompletedSteps {
		if step == req.StepID {
			if !req.Done {
				progress.CompletedSteps = append(progress.CompletedSteps[:i], progress.CompletedSteps[i+1:]...)
			}
			found = true
			break
		}
	}

	if !found && req.Done {
		progress.CompletedSteps = append(progress.CompletedSteps, req.StepID)
	}

	progress.UpdatedAt = time.Now().Unix()
	pdata, _ := json.Marshal(progress)
	database.Set([]byte("progress:"+userID+":"+guideID), pdata)

	c.JSON(http.StatusOK, progress)
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	guides := r.Group("/guides")
	{
		guides.POST("", s.CreateGuide)
		guides.GET("", s.ListGuides)
		guides.GET("/:id", s.GetGuide)
		guides.DELETE("/:id", s.DeleteGuide)
		guides.GET("/:id/progress/:userId", s.GetProgress)
		guides.POST("/:id/progress/:userId", s.UpdateProgress)
	}
}
