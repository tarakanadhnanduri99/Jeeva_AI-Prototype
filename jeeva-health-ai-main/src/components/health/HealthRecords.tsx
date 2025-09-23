import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Enums } from '@/integrations/supabase/types';

interface HealthRecordItem {
  id: string;
  record_type: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  date_recorded: string;
  created_at: string;
}

const HealthRecords = () => {
  const { profile, user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recordType, setRecordType] = useState<Enums<'record_type'> | 'other'>('lab_report');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [loadingList, setLoadingList] = useState(false);
  const [records, setRecords] = useState<HealthRecordItem[]>([]);

  const loadRecords = async () => {
    if (!profile?.id) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('health_records')
        .select('id, record_type, title, description, file_url, file_type, date_recorded, created_at')
        .eq('patient_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading records:', error);
      } else {
        setRecords((data || []) as any);
      }
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleGetSignedUrl = async (path: string | null) => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from('health-records').createSignedUrl(path, 60);
    if (error) {
      console.error('Signed URL error:', error);
      toast({ variant: 'destructive', title: 'Download failed', description: error.message });
      return null;
    }
    return data?.signedUrl || null;
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !user?.id) return;
    if (!file || !title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please select a file and enter a title.',
      });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext || 'bin'}`;

      const { error: uploadErr } = await supabase
        .storage
        .from('health-records')
        .upload(path, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const fileUrl = path; // We'll use path; signed URLs can be generated when viewing

      const { data: inserted, error: insertErr } = await supabase
        .from('health_records')
        .insert({
          patient_id: profile.id,
          record_type: recordType as Enums<'record_type'>,
          title: title.trim(),
          description: description.trim() || null,
          file_url: fileUrl,
          file_type: file.type || ext || null,
          hospital_name: null,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      // Invoke AI analysis (basic: use title + description)
      try {
        const { data: analysisResp, error: fnErr } = await supabase.functions.invoke('analyze-health-records', {
          body: {
            record_text: `${title} \n${description}`.trim(),
            record_type: recordType,
            patient_id: profile.id,
            record_id: inserted.id,
          }
        });
        if (fnErr) throw fnErr;
        const parsed = (() => {
          try {
            return analysisResp?.analysis ? JSON.parse(analysisResp.analysis) : { raw: analysisResp?.analysis };
          } catch {
            return { raw: analysisResp?.analysis };
          }
        })();

        await supabase.from('ai_insights').insert({
          patient_id: profile.id,
          record_id: inserted.id,
          insight_type: recordType,
          content: parsed,
          risk_level: parsed?.risk_level || null,
          recommendations: parsed?.recommendations || null,
        });
      } catch (analysisError) {
        console.warn('AI analysis failed, continuing:', analysisError);
      }

      toast({ title: 'Record uploaded' });
      setOpen(false);
      setTitle('');
      setDescription('');
      setRecordType('lab_report');
      setFile(null);
      await loadRecords();
    } catch (err: any) {
      console.error('Upload failed:', err);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Health Records</CardTitle>
          <CardDescription>
            Upload and manage your medical documents, prescriptions, and test results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Upload New Record
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Health Record</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleUpload}>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Blood Test Results" />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
                </div>
                <div>
                  <Label>Record Type</Label>
                  <Select value={recordType} onValueChange={(v) => setRecordType(v as Enums<'record_type'>)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prescription">Prescription</SelectItem>
                      <SelectItem value="lab_report">Lab Report</SelectItem>
                      <SelectItem value="imaging">Imaging</SelectItem>
                      <SelectItem value="consultation_note">Consultation Note</SelectItem>
                      <SelectItem value="discharge_summary">Discharge Summary</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="file">File</Label>
                  <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Records</CardTitle>
          <CardDescription>
            {loadingList ? 'Loading...' : records.length ? 'Your uploaded health records' : 'No records yet'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 border rounded-md">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.record_type.replace('_', ' ')} • {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const url = await handleGetSignedUrl(r.file_url);
                    if (url) {
                      window.open(url, '_blank');
                    }
                  }}
                  disabled={!r.file_url}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default HealthRecords;