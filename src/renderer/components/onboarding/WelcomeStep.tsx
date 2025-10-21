import { Shield, Database, Zap, Lock } from 'lucide-react';

export function WelcomeStep() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Levante</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Your Personal, Secure, and Free AI Assistant
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <p className="text-center text-muted-foreground">
          Levante brings AI closer to everyone—not just technical users. We focus on:
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Lock className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">Privacy First</h3>
              <p className="text-sm text-muted-foreground">
                All conversations stay on your device
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Zap className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">Multi-Provider Access</h3>
              <p className="text-sm text-muted-foreground">
                Choose from 100+ AI models
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Database className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">Local Storage</h3>
              <p className="text-sm text-muted-foreground">
                No cloud sync, no tracking
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Shield className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">MCP Support</h3>
              <p className="text-sm text-muted-foreground">
                Extend AI with powerful tools
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground pt-4">
          Let's get you set up in just a few steps!
        </p>
      </div>
    </div>
  );
}
