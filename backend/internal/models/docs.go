package models

type Document struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	UploaderID string   `json:"uploader_id"`
	Type       string   `json:"type"`
	Size       string   `json:"size"`
	Thumbnail  string   `json:"thumbnail"`
	Tags       []string `json:"tags"`
	AISummary  string   `json:"ai_summary"`
	Content    string   `json:"content"`
	CreatedAt  int64    `json:"created_at"`
}

type CreateDocRequest struct {
	Title     string   `json:"title" binding:"required"`
	Type      string   `json:"type" binding:"required"`
	Size      string   `json:"size"`
	Thumbnail string   `json:"thumbnail"`
	Tags      []string `json:"tags"`
	Content   string   `json:"content"`
	AISummary string   `json:"ai_summary"`
}

type SearchResponse struct {
	Results []Document `json:"results"`
	Total   int        `json:"total"`
	Query   string     `json:"query"`
}
