import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

const ConsentManagement = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Consent Management</span>
          </CardTitle>
          <CardDescription>
            Control who can access your health data and manage permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No pending consent requests</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConsentManagement;