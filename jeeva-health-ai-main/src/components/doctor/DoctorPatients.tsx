import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const DoctorPatients = () => {
  const { profile, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const resolveDoctorId = async (): Promise<string | null> => {
    try {
      if (doctorId) return doctorId;
      if (profile?.id) {
        setDoctorId(profile.id);
        return profile.id;
      }
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Error resolving doctor id:', error);
        return null;
      }
      if (data?.id) {
        setDoctorId(data.id);
        refreshProfile?.();
        return data.id;
      }
      return null;
    } catch (e) {
      console.error('Resolve doctor id exception:', e);
      return null;
    }
  };

  const loadPatients = async () => {
    const id = await resolveDoctorId();
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('consent_requests')
        .select(`
          id,
          status,
          patient:patient_id ( id, first_name, last_name, email )
        `)
        .eq('doctor_id', id)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading patients:', error);
      } else {
        const uniquePatientsMap = new Map<string, any>();
        (data || []).forEach((r: any) => {
          if (r.patient?.id && !uniquePatientsMap.has(r.patient.id)) {
            uniquePatientsMap.set(r.patient.id, r.patient);
          }
        });
        setPatients(Array.from(uniquePatientsMap.values()));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, user?.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await resolveDoctorId();
    if (!id || !user?.id) {
      toast({ variant: 'destructive', title: 'Doctor profile not ready', description: 'Please wait and try again.' });
      return;
    }
    if (!email.trim()) {
      toast({ variant: 'destructive', title: 'Email required', description: 'Enter the patient email to request consent.' });
      return;
    }
    setAdding(true);
    try {
      const normalizedEmail = email.trim();
      const { data, error } = await supabase.functions.invoke('request-consent', {
        body: {
          doctor_user_id: user.id,
          patient_email: normalizedEmail,
          purpose: 'Add patient under care',
        }
      });
      if (error) throw error as any;
      if (data?.success) {
        toast({ title: 'Consent request sent' });
        setEmail('');
        await loadPatients();
      } else {
        toast({ variant: 'destructive', title: 'Failed', description: data?.error || 'Could not send request' });
      }
    } catch (err: any) {
      console.error('Error requesting consent:', err);
      toast({ variant: 'destructive', title: 'Failed to send request', description: err?.message || 'Please try again.' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>My Patients</span>
          </CardTitle>
          <CardDescription>
            View and manage your patients (based on approved consents)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-3" onSubmit={handleAdd}>
            <div className="flex-1">
              <Label htmlFor="email">Add by Email (requests consent)</Label>
              <Input
                id="email"
                type="email"
                placeholder="patient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={adding}>{adding ? 'Sending...' : 'Request'}</Button>
            </div>
          </form>

          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : patients.length === 0 ? (
            <p className="text-muted-foreground">No approved patients yet</p>
          ) : (
            <div className="space-y-2">
              {patients.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">{p.first_name} {p.last_name}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Approved</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DoctorPatients;