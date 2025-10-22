import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WizardStepProps {
  currentStep: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  children: ReactNode;
  showProgress?: boolean;
}

export function WizardStep({
  currentStep,
  totalSteps,
  onNext,
  onBack,
  nextLabel = 'Next',
  nextDisabled = false,
  backDisabled = false,
  children,
  showProgress = true,
}: WizardStepProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Draggable area for macOS - top bar */}
      <div
        className="fixed top-0 left-0 right-0 h-12 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <Card className="w-full max-w-2xl border-none">
        {showProgress && (
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of {totalSteps}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-8 rounded-full transition-colors ${
                      i < currentStep ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
            </div>
          </CardHeader>
        )}

        <CardContent className="pt-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {children}
        </CardContent>

        <CardFooter className="flex justify-between pt-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button
            variant="outline"
            onClick={onBack}
            disabled={backDisabled || currentStep === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          <Button onClick={onNext} disabled={nextDisabled} className="gap-2">
            {nextLabel}
            {nextLabel === 'Next' && <ChevronRight className="h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
