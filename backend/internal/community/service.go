package community

import (
	"encoding/json"
	"net/http"
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

func (s *Service) CreatePost(c *gin.Context) {
	var req models.CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := auth.GetUserID(c)

	post := models.CommunityPost{
		ID:         uuid.New().String(),
		AuthorID:   userID,
		Content:    req.Content,
		Tags:       req.Tags,
		CreatedAt:  time.Now().Unix(),
		UpdatedAt:  time.Now().Unix(),
		Upvotes:    0,
		Downvotes:  0,
		AIVerified: true,
	}

	data, _ := json.Marshal(post)
	if err := database.Set([]byte("post:"+post.ID), data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}

	if err := database.Set([]byte("user:"+userID+":posts:"+post.ID), []byte("1")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link post to user"})
		return
	}

	c.JSON(http.StatusCreated, post)
}

func (s *Service) GetPost(c *gin.Context) {
	postID := c.Param("id")

	data, err := database.Get([]byte("post:" + postID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	var post models.CommunityPost
	json.Unmarshal(data, &post)

	c.JSON(http.StatusOK, post)
}

func (s *Service) ListPosts(c *gin.Context) {
	var posts []models.CommunityPost

	database.Iterate([]byte("post:"), func(key, value []byte) error {
		var post models.CommunityPost
		if err := json.Unmarshal(value, &post); err == nil {
			posts = append(posts, post)
		}
		return nil
	})

	c.JSON(http.StatusOK, posts)
}

func (s *Service) VotePost(c *gin.Context) {
	postID := c.Param("id")

	data, err := database.Get([]byte("post:" + postID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	var post models.CommunityPost
	json.Unmarshal(data, &post)

	var vote struct {
		Type string `json:"type" binding:"required,oneof=up down"`
	}

	if err := c.ShouldBindJSON(&vote); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if vote.Type == "up" {
		post.Upvotes++
	} else {
		post.Downvotes++
	}

	post.UpdatedAt = time.Now().Unix()
	data, _ = json.Marshal(post)
	database.Set([]byte("post:"+postID), data)

	c.JSON(http.StatusOK, gin.H{
		"upvotes":   post.Upvotes,
		"downvotes": post.Downvotes,
		"score":     post.Upvotes - post.Downvotes,
	})
}

func (s *Service) SearchPosts(c *gin.Context) {
	query := c.Query("q")
	tag := c.Query("tag")

	var posts []models.CommunityPost

	database.Iterate([]byte("post:"), func(key, value []byte) error {
		var post models.CommunityPost
		if err := json.Unmarshal(value, &post); err != nil {
			return nil
		}

		match := true
		if query != "" {
			match = match && (containsIgnoreCase(post.Content, query) ||
				containsSliceIgnoreCase(post.Tags, query))
		}
		if tag != "" {
			match = match && containsSlice(post.Tags, tag)
		}

		if match {
			posts = append(posts, post)
		}
		return nil
	})

	c.JSON(http.StatusOK, posts)
}

func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0)
}

func containsSliceIgnoreCase(slice []string, query string) bool {
	for _, item := range slice {
		if len(item) >= len(query) {
			return true
		}
	}
	return false
}

func containsSlice(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	posts := r.Group("/posts")
	{
		posts.POST("", s.CreatePost)
		posts.GET("", s.ListPosts)
		posts.GET("/search", s.SearchPosts)
		posts.GET("/:id", s.GetPost)
		posts.POST("/:id/vote", s.VotePost)
	}
}
