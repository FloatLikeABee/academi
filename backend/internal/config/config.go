package config

import (
	"os"
	"sync"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	AI       AIConfig
	Cache    CacheConfig
	CORS     CORSConfig
}

type ServerConfig struct {
	Port string
	Mode string
}

type DatabaseConfig struct {
	Path               string
	ValueLogMaxEntries int
}

type JWTConfig struct {
	Secret      string
	ExpiryHours int
}

type AIConfig struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
}

type CacheConfig struct {
	DefaultTTL int
}

type CORSConfig struct {
	Origins []string
}

var (
	instance *Config
	once     sync.Once
)

func Load() *Config {
	once.Do(func() {
		godotenv.Load()
		instance = &Config{
			Server: ServerConfig{
				Port: getEnv("SERVER_PORT", "8080"),
				Mode: getEnv("SERVER_MODE", "debug"),
			},
			Database: DatabaseConfig{
				Path:               getEnv("DB_PATH", "./data/badger"),
				ValueLogMaxEntries: 1000000,
			},
			JWT: JWTConfig{
				Secret:      getEnv("JWT_SECRET", "academi-secret-key"),
				ExpiryHours: 24,
			},
			AI: AIConfig{
				APIKey:      getEnv("AI_API_KEY", ""),
				BaseURL:     getEnv("AI_BASE_URL", "https://api.openai.com/v1"),
				Model:       getEnv("AI_MODEL", "gpt-4"),
				MaxTokens:   2048,
				Temperature: 0.7,
			},
			Cache: CacheConfig{
				DefaultTTL: 3600,
			},
			CORS: CORSConfig{
				Origins: []string{"http://localhost:3000", "http://localhost:8081"},
			},
		}
	})
	return instance
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func (c *JWTConfig) ExpiryDuration() time.Duration {
	return time.Duration(c.ExpiryHours) * time.Hour
}
