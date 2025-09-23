import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Insight {
  id: string;
  insight_type: string;
  content: any;
  risk_level: string | null;
  recommendations: string[] | null;
  created_at: string;
}

const riskColor = (risk: string | null | undefined) => {
  switch ((risk || '').toLowerCase()) {
    case 'high':
      return 'bg-destructive text-destructive-foreground';
    case 'medium':
      return 'bg-warning text-warning-foreground';
    case 'low':
      return 'bg-success text-success-foreground';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
};

const AIAnalytics = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);

  const loadInsights = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, insight_type, content, risk_level, recommendations, created_at')
        .eq('patient_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading insights:', error);
      } else {
        setInsights((data || []) as any);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const renderSummary = (content: any) => {
    if (!content) return 'No summary available';
    if (typeof content === 'string') return content.slice(0, 240);
    if (content.raw) return String(content.raw).slice(0, 240);
    const indicators = content.indicators ? JSON.stringify(content.indicators).slice(0, 120) : '';
    return [indicators, content.concerns]?.filter(Boolean).join(' • ').slice(0, 240) || 'Insight available';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5" />
                <span>AI Health Analytics</span>
              </CardTitle>
              <CardDescription>
                AI-powered insights from your health data using Gemini 2.5 Flash
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadInsights} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-muted-foreground">Loading...</p>}
          {!loading && insights.length === 0 && (
            <p className="text-muted-foreground">Your AI insights will appear here</p>
          )}
          {insights.map((insight) => (
            <div key={insight.id} className="p-4 border rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium capitalize">{insight.insight_type.replace('_', ' ')}</span>
                  <span className="text-muted-foreground ml-2">
                    {new Date(insight.created_at).toLocaleString()}
                  </span>
                </div>
                <Badge className={riskColor(insight.risk_level)} variant="outline">
                  {insight.risk_level ? insight.risk_level : 'unknown'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {renderSummary(insight.content)}
              </div>
              {insight.recommendations && insight.recommendations.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {insight.recommendations.slice(0, 5).map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AIAnalytics;