package models

type Guide struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	Category    string      `json:"category"`
	Icon        string      `json:"icon"`
	Color       string      `json:"color"`
	Steps       []GuideStep `json:"steps"`
	CreatedAt   int64       `json:"created_at"`
}

type GuideStep struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content,omitempty"`
}

type UserGuideProgress struct {
	UserID         string `json:"user_id"`
	GuideID        string `json:"guide_id"`
	CompletedSteps []int  `json:"completed_steps"`
	StartedAt      int64  `json:"started_at"`
	UpdatedAt      int64  `json:"updated_at"`
}

type CreateGuideRequest struct {
	Title       string      `json:"title" binding:"required"`
	Description string      `json:"description" binding:"required"`
	Category    string      `json:"category"`
	Icon        string      `json:"icon"`
	Color       string      `json:"color"`
	Steps       []GuideStep `json:"steps" binding:"required"`
}
