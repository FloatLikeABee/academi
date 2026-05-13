package docs

import (
	"encoding/json"
	"sort"
	"strings"
	"unicode"

	"github.com/academi/backend/internal/database"
	"github.com/academi/backend/internal/models"
)

const ragContentScanMax = 14000

func tokenizeForRelated(s string) []string {
	s = strings.ToLower(s)
	var tokens []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() < 2 {
			cur.Reset()
			return
		}
		tokens = append(tokens, cur.String())
		cur.Reset()
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			cur.WriteRune(r)
			continue
		}
		flush()
	}
	flush()
	return tokens
}

func uniqStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	var out []string
	for _, t := range in {
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

type docScore struct {
	doc   models.Document
	score int
}

// TopRelatedDocuments returns up to limit saved documents ranked by simple token overlap with query.
// excludeIDs are skipped (e.g. already attached in chat). Image types and empty text are skipped.
func (s *Service) TopRelatedDocuments(query string, limit int, excludeIDs map[string]struct{}) []models.Document {
	query = strings.TrimSpace(query)
	if limit <= 0 {
		return nil
	}
	tokens := uniqStrings(tokenizeForRelated(query))
	if len(tokens) == 0 {
		return nil
	}

	var scored []docScore
	database.Iterate([]byte("doc:"), func(key, value []byte) error {
		var doc models.Document
		if err := json.Unmarshal(value, &doc); err != nil {
			return nil
		}
		if excludeIDs != nil {
			if _, skip := excludeIDs[doc.ID]; skip {
				return nil
			}
		}
		if strings.EqualFold(strings.TrimSpace(doc.Type), "image") {
			return nil
		}
		content := doc.Content
		if len(content) > ragContentScanMax {
			content = content[:ragContentScanMax]
		}
		title := strings.ToLower(doc.Title)
		summary := strings.ToLower(doc.AISummary)
		body := strings.ToLower(content)
		var sc int
		for _, tok := range tokens {
			if strings.Contains(title, tok) {
				sc += 5
				continue
			}
			if strings.Contains(summary, tok) {
				sc += 3
				continue
			}
			if strings.Contains(body, tok) {
				sc += 1
			}
		}
		for _, tag := range doc.Tags {
			tl := strings.ToLower(tag)
			for _, tok := range tokens {
				if strings.Contains(tl, tok) {
					sc += 2
				}
			}
		}
		if sc > 0 {
			scored = append(scored, docScore{doc: doc, score: sc})
		}
		return nil
	})

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].doc.CreatedAt > scored[j].doc.CreatedAt
	})

	var out []models.Document
	for i := 0; i < len(scored) && len(out) < limit; i++ {
		out = append(out, scored[i].doc)
	}
	return out
}
