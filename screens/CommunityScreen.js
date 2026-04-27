import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Image, Dimensions, ScrollView
} from 'react-native';
import Card from '../components/Card';
import TagChip from '../components/TagChip';
import useAppStore from '../store/appStore';

const { width } = Dimensions.get('window');

const mockPosts = [
  {
    id: 1,
    author: { name: "Alex Chen", avatar: "https://via.placeholder.com/40" },
    content: "Just finished my research paper on quantum computing applications in cryptography. Would love feedback from anyone interested in the field!",
    timestamp: "2h ago",
    tags: ["#quantum", "#crypto", "#research"],
    stats: { upvotes: 124, downvotes: 3, comments: 18, shares: 7 },
    hasAISummary: true,
    aiSummary: "Research paper on quantum computing applications in cryptography seeking feedback.",
    aiModerated: true,
  },
  {
    id: 2,
    author: { name: "Samira Patel", avatar: "https://via.placeholder.com/40" },
    content: "Struggling with understanding tensor calculus for general relativity. Any recommended resources or explanations?",
    timestamp: "5h ago",
    tags: ["#physics", "#math", "#relativity"],
    stats: { upvotes: 89, downvotes: 1, comments: 23, shares: 4 },
    hasAISummary: true,
    aiSummary: "Request for resources on tensor calculus for general relativity.",
    aiModerated: true,
  },
  {
    id: 3,
    author: { name: "Jordan Kim", avatar: "https://via.placeholder.com/40" },
    content: "Shared a comprehensive guide on CRISPR gene editing techniques. Includes protocols and troubleshooting tips.",
    timestamp: "1d ago",
    tags: ["#biology", "#genetics", "#labwork"],
    stats: { upvotes: 203, downvotes: 5, comments: 31, shares: 15 },
    hasAISummary: true,
    aiSummary: "Comprehensive guide on CRISPR gene editing techniques with protocols.",
    aiModerated: true,
  },
];

const TAG_FILTERS = ["All", "#quantum", "#physics", "#math", "#biology", "#cs", "#chemistry"];

export default function CommunityScreen() {
  const { isDarkMode } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState('All');
  const [expandedAI, setExpandedAI] = useState({});

  const filteredPosts = mockPosts.filter(post => {
    const matchesSearch = post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.author.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = activeTag === 'All' || post.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  const toggleAISummary = (postId) => {
    setExpandedAI(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const renderPost = ({ item }) => (
    <View style={styles.postContainer}>
      <View style={styles.postHeader}>
        <Image source={{ uri: item.author.avatar }} style={styles.avatar} />
        <View style={styles.postInfo}>
          <Text style={styles.authorName}>{item.author.name}</Text>
          <Text style={styles.postTime}>{item.timestamp}</Text>
        </View>
        {item.aiModerated && (
          <View style={styles.aiModerationBadge}>
            <Text style={styles.aiModerationText}>🤖 AI Verified</Text>
          </View>
        )}
      </View>

      <Text style={styles.postContent}>{item.content}</Text>

      <View style={styles.tagsRow}>
        {item.tags.map((tag, index) => (
          <TagChip key={index} label={tag} variant="active" />
        ))}
      </View>

      {item.hasAISummary && (
        <TouchableOpacity
          style={styles.aiSummaryButton}
          onPress={() => toggleAISummary(item.id)}
          activeOpacity={0.6}
        >
          <Text style={styles.aiSummaryIcon}>🧠</Text>
          <Text style={styles.aiSummaryText}>
            {expandedAI[item.id] ? 'Hide TL;DR' : 'AI TL;DR'}
          </Text>
        </TouchableOpacity>
      )}

      {item.hasAISummary && expandedAI[item.id] && (
        <View style={styles.aiSummaryContent}>
          <Text style={styles.aiSummaryTextContent}>{item.aiSummary}</Text>
        </View>
      )}

      <View style={styles.statsContainer}>
        <View style={styles.voteGroup}>
          <TouchableOpacity style={styles.voteButton} activeOpacity={0.6}>
            <Text style={styles.voteText}>▲</Text>
          </TouchableOpacity>
          <Text style={styles.voteCount}>{item.stats.upvotes - item.stats.downvotes}</Text>
          <TouchableOpacity style={styles.voteButton} activeOpacity={0.6}>
            <Text style={styles.voteText}>▼</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.statItem}>💬 {item.stats.comments}</Text>
        <Text style={styles.statItem}>↗ {item.stats.shares}</Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickActionItem} activeOpacity={0.6}>
          <Text style={styles.quickActionIcon}>💬</Text>
          <Text style={styles.quickActionLabel}>Comment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionItem} activeOpacity={0.6}>
          <Text style={styles.quickActionIcon}>↗</Text>
          <Text style={styles.quickActionLabel}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionItem} activeOpacity={0.6}>
          <Text style={styles.quickActionIcon}>🔖</Text>
          <Text style={styles.quickActionLabel}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
        <View style={styles.searchWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search posts..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholderTextColor="rgba(168, 178, 209, 0.5)"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagFilterBar}>
        {TAG_FILTERS.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[styles.tagFilterButton, activeTag === tag && styles.tagFilterActive]}
            onPress={() => setActiveTag(tag)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tagFilterText, activeTag === tag && styles.tagFilterTextActive]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredPosts}
        keyExtractor={item => item.id.toString()}
        renderItem={renderPost}
        contentContainerStyle={styles.listContentContainer}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1C',
  },
  header: {
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  searchWrapper: {
    height: 40,
  },
  searchInput: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  tagFilterBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tagFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 8,
  },
  tagFilterActive: {
    backgroundColor: 'rgba(91, 140, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(91, 140, 255, 0.4)',
  },
  tagFilterText: {
    color: '#A8B2D1',
    fontSize: 13,
    fontWeight: '500',
  },
  tagFilterTextActive: {
    color: '#5B8CFF',
    fontWeight: '600',
  },
  listContentContainer: {
    paddingBottom: 80,
  },
  postContainer: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    margin: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  postInfo: {
    flex: 1,
  },
  authorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  postTime: {
    color: '#A8B2D1',
    fontSize: 12,
  },
  aiModerationBadge: {
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  aiModerationText: {
    color: '#00D4FF',
    fontSize: 10,
    fontWeight: '600',
  },
  postContent: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  aiSummaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(155, 109, 255, 0.1)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(155, 109, 255, 0.2)',
  },
  aiSummaryIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  aiSummaryText: {
    color: '#9B6DFF',
    fontSize: 13,
    fontWeight: '600',
  },
  aiSummaryContent: {
    backgroundColor: 'rgba(155, 109, 255, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#9B6DFF',
  },
  aiSummaryTextContent: {
    color: '#A8B2D1',
    fontSize: 13,
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  voteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  voteButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  voteText: {
    color: '#A8B2D1',
    fontSize: 14,
    fontWeight: '700',
  },
  voteCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  statItem: {
    color: '#A8B2D1',
    fontSize: 13,
    marginRight: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  quickActionItem: {
    alignItems: 'center',
    padding: 8,
  },
  quickActionIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  quickActionLabel: {
    color: '#A8B2D1',
    fontSize: 11,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5B8CFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5B8CFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
  },
});
