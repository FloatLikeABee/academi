import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Dimensions, Animated
} from 'react-native';
import Card from '../components/Card';
import NeuralSearchBar from '../components/NeuralSearchBar';
import TagChip from '../components/TagChip';

const { width } = Dimensions.get('window');

const mockDocs = [
  {
    id: 1,
    title: "Quantum Computing Fundamentals",
    type: "pdf",
    thumbnail: "https://via.placeholder.com/150",
    tags: ["#quantum", "#computing", "#physics"],
    aiSummary: "Introduction to quantum bits, superposition, and quantum gates.",
    uploadedBy: "Alex Chen",
    uploadedAt: "2 days ago",
    size: "2.4 MB",
  },
  {
    id: 2,
    title: "Neural Networks Diagram",
    type: "image",
    thumbnail: "https://via.placeholder.com/150",
    tags: ["#ai", "#machinelearning", "#diagram"],
    aiSummary: "Visual representation of a multi-layer neural network architecture.",
    uploadedBy: "Samira Patel",
    uploadedAt: "5 days ago",
    size: "1.2 MB",
  },
  {
    id: 3,
    title: "Research Methodology",
    type: "video",
    thumbnail: "https://via.placeholder.com/150",
    tags: ["#research", "#methods", "#education"],
    aiSummary: "Overview of qualitative and quantitative research methodologies.",
    uploadedBy: "Jordan Kim",
    uploadedAt: "1 week ago",
    size: "45.6 MB",
  },
  {
    id: 4,
    title: "Linear Algebra Notes",
    type: "document",
    thumbnail: "https://via.placeholder.com/150",
    tags: ["#math", "#algebra", "#notes"],
    aiSummary: "Comprehensive notes on vector spaces and matrix operations.",
    uploadedBy: "Taylor Wong",
    uploadedAt: "3 days ago",
    size: "890 KB",
  },
  {
    id: 5,
    title: "Organic Chemistry Reactions",
    type: "pdf",
    thumbnail: "https://via.placeholder.com/150",
    tags: ["#chemistry", "#organic", "#reactions"],
    aiSummary: "Chart of common organic chemistry reactions and mechanisms.",
    uploadedBy: "Maya Singh",
    uploadedAt: "4 days ago",
    size: "3.1 MB",
  },
  {
    id: 6,
    title: "Data Structures in Python",
    type: "document",
    thumbnail: "https://via.placeholder.com/150",
    tags: ["#cs", "#python", "#algorithms"],
    aiSummary: "Reference guide for common data structures and their implementations.",
    uploadedBy: "Ryan Lee",
    uploadedAt: "1 week ago",
    size: "1.5 MB",
  },
];

const CATEGORY_FILTERS = ["All", "PDF", "Image", "Video", "Document"];

export default function DocsScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredDocs = mockDocs.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
      doc.aiSummary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || doc.type.toLowerCase() === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const renderGridItem = ({ item }) => (
    <View style={styles.gridItem}>
      <TouchableOpacity style={styles.gridCard} activeOpacity={0.7}>
        <View style={styles.thumbnailWrapper}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.type.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.gridCardContent}>
          <Text style={styles.gridCardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.gridCardSummary} numberOfLines={2}>{item.aiSummary}</Text>
          <View style={styles.gridCardTags}>
            {item.tags.slice(0, 2).map((tag, index) => (
              <Text key={index} style={styles.gridTag}>{tag}</Text>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderListItem = ({ item }) => (
    <TouchableOpacity style={styles.listCard} activeOpacity={0.7}>
      <View style={styles.listCardLeft}>
        <View style={styles.listCardIcon}>
          <Text style={styles.listCardIconText}>
            {item.type === 'pdf' ? '📄' : item.type === 'image' ? '🖼️' : item.type === 'video' ? '🎬' : '📝'}
          </Text>
        </View>
        <View style={styles.listCardInfo}>
          <Text style={styles.listCardTitle}>{item.title}</Text>
          <Text style={styles.listCardMeta}>{item.uploadedBy} · {item.size}</Text>
          <View style={styles.listCardTags}>
            {item.tags.slice(0, 2).map((tag, index) => (
              <Text key={index} style={styles.listTag}>{tag}</Text>
            ))}
          </View>
        </View>
      </View>
      <Text style={styles.listCardChevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Docs</Text>
        <Text style={styles.headerSubtitle}>{filteredDocs.length} documents</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'grid' && styles.viewToggleActive]}
            onPress={() => setViewMode('grid')}
            activeOpacity={0.7}
          >
            <Text style={styles.viewToggleText}>⊞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'list' && styles.viewToggleActive]}
            onPress={() => setViewMode('list')}
            activeOpacity={0.7}
          >
            <Text style={styles.viewToggleText}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>

      <NeuralSearchBar
        placeholder="Search documents, topics, authors..."
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      <View style={styles.categoryBar}>
        {CATEGORY_FILTERS.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryButton, activeCategory === cat && styles.categoryButtonActive]}
            onPress={() => setActiveCategory(cat)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryText, activeCategory === cat && styles.categoryTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'grid' ? (
        <FlatList
          data={filteredDocs}
          keyExtractor={item => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          renderItem={renderGridItem}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={filteredDocs}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={renderListItem}
          showsVerticalScrollIndicator={false}
        />
      )}

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
    padding: 20,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#A8B2D1',
    fontSize: 13,
    flex: 1,
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewToggle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewToggleActive: {
    backgroundColor: 'rgba(91, 140, 255, 0.2)',
  },
  viewToggleText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  categoryBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  categoryText: {
    color: '#A8B2D1',
    fontSize: 12,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#00D4FF',
    fontWeight: '600',
  },
  gridContent: {
    padding: 12,
    paddingBottom: 80,
  },
  gridItem: {
    flex: 1,
    margin: 4,
  },
  gridCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbnailWrapper: {
    height: 120,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10, 15, 28, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gridCardContent: {
    padding: 12,
  },
  gridCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 18,
  },
  gridCardSummary: {
    color: '#A8B2D1',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  gridCardTags: {
    flexDirection: 'row',
  },
  gridTag: {
    color: '#5B8CFF',
    fontSize: 10,
    marginRight: 8,
    fontWeight: '500',
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  listCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listCardIconText: {
    fontSize: 20,
  },
  listCardInfo: {
    flex: 1,
  },
  listCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  listCardMeta: {
    color: '#A8B2D1',
    fontSize: 12,
    marginBottom: 6,
  },
  listCardTags: {
    flexDirection: 'row',
  },
  listTag: {
    color: '#5B8CFF',
    fontSize: 11,
    marginRight: 8,
    fontWeight: '500',
  },
  listCardChevron: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 22,
    marginLeft: 8,
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
