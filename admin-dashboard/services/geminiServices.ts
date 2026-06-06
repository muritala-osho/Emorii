export interface ModerationResult {
  riskScore: number;
  reasoning: string;
  flaggedContent: string[];
  actionRecommendation: 'allow' | 'warn' | 'suspend' | 'ban';
}

export const analyzeUserContent = async (
  _bio: string,
  _reportReasons: string[],
): Promise<ModerationResult> => {
  return {
    riskScore: 0,
    reasoning: 'AI analysis not configured.',
    flaggedContent: [],
    actionRecommendation: 'allow',
  };
};

export const getLocationIntel = async (
  _query: string,
  _coords?: { latitude: number; longitude: number },
) => {
  return { text: 'Location intelligence not configured.', groundingChunks: [] };
};
