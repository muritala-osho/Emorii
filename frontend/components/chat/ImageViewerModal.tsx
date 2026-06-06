import React from 'react';
import { Modal, View, Pressable, FlatList, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/ThemedText';
import ZoomablePhoto from '@/components/ZoomablePhoto';

type Props = {
  viewingImage: string | null;
  imageGallery: string[];
  imageViewerIndex: number;
  imageViewerZoomed: boolean;
  imageViewerListRef: React.RefObject<FlatList<string> | null>;
  viewOnceActive: boolean;
  viewOnceCountdown: number;
  screenWidth: number;
  screenHeight: number;
  onClose: () => void;
  onSave: (uri: string) => void;
  onIndexChange: (index: number) => void;
  onZoomChange: (zoomed: boolean) => void;
};

export default function ImageViewerModal({
  viewingImage,
  imageGallery,
  imageViewerIndex,
  imageViewerZoomed,
  imageViewerListRef,
  viewOnceActive,
  viewOnceCountdown,
  screenWidth,
  screenHeight,
  onClose,
  onSave,
  onIndexChange,
  onZoomChange,
}: Props) {
  return (
    <Modal
      visible={!!viewingImage}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.imageViewerOverlay}>
        <Pressable style={styles.imageViewerClose} onPress={onClose}>
          <Feather name="x" size={28} color="#FFF" />
        </Pressable>
        {viewOnceActive ? (
          <View style={styles.imageViewerActions}>
            <View
              style={[
                styles.imageViewerActionBtn,
                { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
              ]}
            >
              <Ionicons name="eye-outline" size={18} color="#FF6B6B" />
              <ThemedText style={{ color: '#FF6B6B', fontSize: 13, fontWeight: '700' }}>
                View Once · Closes in {viewOnceCountdown}s
              </ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.imageViewerActions}>
            {imageGallery.length > 1 && (
              <View style={[styles.imageViewerActionBtn, { paddingHorizontal: 12 }]}>
                <ThemedText style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>
                  {imageViewerIndex + 1} / {imageGallery.length}
                </ThemedText>
              </View>
            )}
            <Pressable
              style={styles.imageViewerActionBtn}
              onPress={() => {
                const url = imageGallery[imageViewerIndex] || viewingImage;
                if (url) onSave(url);
              }}
            >
              <Ionicons name="download-outline" size={24} color="#FFF" />
            </Pressable>
          </View>
        )}
        {viewingImage &&
          (viewOnceActive || imageGallery.length <= 1 ? (
            <ZoomablePhoto
              source={{ uri: viewingImage }}
              width={screenWidth}
              height={screenHeight * 0.8}
            />
          ) : (
            <FlatList
              ref={imageViewerListRef}
              data={imageGallery}
              keyExtractor={(u, i) => `${i}_${u}`}
              horizontal
              pagingEnabled
              scrollEnabled={!imageViewerZoomed}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={imageViewerIndex}
              getItemLayout={(_, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
              })}
              onMomentumScrollEnd={e => {
                const newIdx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                if (newIdx !== imageViewerIndex) {
                  onIndexChange(newIdx);
                  onZoomChange(false);
                }
              }}
              renderItem={({ item: url }) => (
                <View
                  style={{
                    width: screenWidth,
                    height: screenHeight * 0.8,
                    justifyContent: 'center',
                  }}
                >
                  <ZoomablePhoto
                    source={{ uri: url }}
                    width={screenWidth}
                    height={screenHeight * 0.8}
                    onZoomChange={onZoomChange}
                  />
                </View>
              )}
            />
          ))}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  imageViewerActions: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    flexDirection: 'row',
    gap: 16,
  },
  imageViewerActionBtn: { padding: 8 },
});
