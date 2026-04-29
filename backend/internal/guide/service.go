package guide

import (
	"encoding/json"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/academi/backend/internal/database"
	"github.com/academi/backend/internal/models"
)

type Service struct {
	seedOnce sync.Once
}

func NewService() *Service {
	return &Service{}
}

func subjectKey(id string) []byte {
	return []byte("guide_subject:" + id)
}

func (s *Service) ensureSeeded() {
	s.seedOnce.Do(func() {
		n := 0
		_ = database.Iterate([]byte("guide_subject:"), func(key, value []byte) error {
			n++
			return nil
		})
		if n > 0 {
			return
		}
		now := time.Now().Unix()
		for _, sub := range mockSubjects(now) {
			b, _ := json.Marshal(sub)
			_ = database.Set(subjectKey(sub.ID), b)
		}
		for _, g := range mockGuides(now) {
			b, _ := json.Marshal(g)
			_ = database.Set([]byte("guide:"+g.ID), b)
		}
	})
}

func mockSubjects(now int64) []models.GuideSubject {
	return []models.GuideSubject{
		{ID: "subj-math", Name: "Mathematics", Description: "Algebra through calculus — problem sets and mock learning paths.", Icon: "📐", SortOrder: 10, CreatedAt: now},
		{ID: "subj-cs", Name: "Computer Science", Description: "Programming, data structures, and how systems fit together.", Icon: "💻", SortOrder: 20, CreatedAt: now},
		{ID: "subj-bio", Name: "Biology", Description: "Cells, genetics, evolution, and ecology (mock catalog).", Icon: "🧬", SortOrder: 30, CreatedAt: now},
		{ID: "subj-hist", Name: "History", Description: "Timelines, sources, and how to read evidence.", Icon: "📜", SortOrder: 40, CreatedAt: now},
		{ID: "subj-write", Name: "Writing", Description: "Structure, clarity, and revising drafts.", Icon: "✍️", SortOrder: 50, CreatedAt: now},
	}
}

func mockGuides(now int64) []models.Guide {
	return []models.Guide{
		{
			ID: "guide-math-calc", SubjectID: "subj-math", Title: "Calculus in one week",
			Description: "A compact mock path: limits, derivatives, and integrals.",
			Category: "Calculus", Icon: "📈", Color: "#5b8cff",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Limits", Content: "Build intuition with graphs and tables before ε–δ."},
				{ID: 2, Title: "Derivatives", Content: "Power rule, product/quotient, and chain rule drills."},
				{ID: 3, Title: "Integrals", Content: "Antiderivatives and interpreting area under curves."},
			},
			CreatedAt: now,
		},
		{
			ID: "guide-math-linalg", SubjectID: "subj-math", Title: "Linear algebra refresh",
			Description: "Vectors, matrices, and eigenvalues — mock overview.",
			Category: "Linear algebra", Icon: "⊡", Color: "#7c6cff",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Vectors & spaces", Content: "Span, basis, and orthogonality in plain language."},
				{ID: 2, Title: "Matrix ops", Content: "Multiplication as composing transformations."},
				{ID: 3, Title: "Eigenstuff", Content: "Why eigenvectors show stable directions."},
			},
			CreatedAt: now,
		},
		{
			ID: "guide-cs-py", SubjectID: "subj-cs", Title: "Python patterns",
			Description: "Readable scripts, modules, and error handling (mock).",
			Category: "Programming", Icon: "🐍", Color: "#3ecf8e",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Project layout", Content: "Packages, `if __name__ == \"__main__\"`, and virtual envs."},
				{ID: 2, Title: "Types & tests", Content: "Gradual typing and a few quick unit tests."},
			},
			CreatedAt: now,
		},
		{
			ID: "guide-cs-git", SubjectID: "subj-cs", Title: "Git for study projects",
			Description: "Branching, commits, and clean history basics.",
			Category: "Tools", Icon: "⎇", Color: "#f0766b",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Commits", Content: "Small, focused commits with clear messages."},
				{ID: 2, Title: "Branches", Content: "Feature branches and merge vs rebase tradeoffs."},
				{ID: 3, Title: "Remotes", Content: "Push, pull, and resolve simple conflicts."},
			},
			CreatedAt: now,
		},
		{
			ID: "guide-bio-cell", SubjectID: "subj-bio", Title: "Cell biology tour",
			Description: "Organelles and how traffic moves inside cells.",
			Category: "Cells", Icon: "🔬", Color: "#5b8cff",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Membrane", Content: "Transport channels and energy cost."},
				{ID: 2, Title: "Energy", Content: "Mitochondria, ATP, and metabolic themes."},
			},
			CreatedAt: now,
		},
		{
			ID: "guide-hist-sources", SubjectID: "subj-hist", Title: "Working with sources",
			Description: "Bias, corroboration, and building an argument.",
			Category: "Methods", Icon: "🕯️", Color: "#c9a45c",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Context", Content: "When/where/who produced the source."},
				{ID: 2, Title: "Compare", Content: "Pair primary accounts and spot gaps."},
			},
			CreatedAt: now,
		},
		{
			ID: "guide-write-essay", SubjectID: "subj-write", Title: "Short essay workflow",
			Description: "Thesis, outline, draft, revise (mock checklist).",
			Category: "Exposition", Icon: "📝", Color: "#8ab4ff",
			Steps: []models.GuideStep{
				{ID: 1, Title: "Claim", Content: "One arguable sentence the whole essay supports."},
				{ID: 2, Title: "Evidence", Content: "Quote or paraphrase with citations."},
				{ID: 3, Title: "Revision", Content: "Cut fluff, tighten topic sentences."},
			},
			CreatedAt: now,
		},
	}
}

// ListSubjects returns persisted subjects (bootstraps mock catalog once if empty).
func (s *Service) ListSubjects(c *gin.Context) {
	s.ensureSeeded()
	var subs []models.GuideSubject
	_ = database.Iterate([]byte("guide_subject:"), func(key, value []byte) error {
		var sub models.GuideSubject
		if json.Unmarshal(value, &sub) != nil {
			return nil
		}
		subs = append(subs, sub)
		return nil
	})
	sort.Slice(subs, func(i, j int) bool {
		if subs[i].SortOrder != subs[j].SortOrder {
			return subs[i].SortOrder < subs[j].SortOrder
		}
		return subs[i].Name < subs[j].Name
	})
	c.JSON(http.StatusOK, subs)
}

func (s *Service) CreateGuide(c *gin.Context) {
	var req models.CreateGuideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	guide := models.Guide{
		ID:          uuid.New().String(),
		SubjectID:   req.SubjectID,
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
	s.ensureSeeded()
	guideID := c.Param("id")

	data, err := database.Get([]byte("guide:" + guideID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guide not found"})
		return
	}

	var g models.Guide
	json.Unmarshal(data, &g)

	c.JSON(http.StatusOK, g)
}

// ListGuides lists guides; optional query subject_id filters to one subject.
func (s *Service) ListGuides(c *gin.Context) {
	s.ensureSeeded()
	subjectFilter := c.Query("subject_id")
	var guides []models.Guide
	_ = database.Iterate([]byte("guide:"), func(key, value []byte) error {
		var g models.Guide
		if err := json.Unmarshal(value, &g); err != nil {
			return nil
		}
		if subjectFilter != "" && g.SubjectID != subjectFilter {
			return nil
		}
		guides = append(guides, g)
		return nil
	})
	sort.Slice(guides, func(i, j int) bool {
		return guides[i].Title < guides[j].Title
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

// RegisterRoutes mounts handlers on a group whose path is already /guides (e.g. /api/v1/guides).
func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/subjects", s.ListSubjects)
	r.POST("", s.CreateGuide)
	r.GET("", s.ListGuides)
	r.GET("/:id", s.GetGuide)
	r.DELETE("/:id", s.DeleteGuide)
	r.GET("/:id/progress/:userId", s.GetProgress)
	r.POST("/:id/progress/:userId", s.UpdateProgress)
}
