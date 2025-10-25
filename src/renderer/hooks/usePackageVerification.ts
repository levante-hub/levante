import { useState, useEffect } from 'react';
import { OFFICIAL_MCP_PACKAGES } from '@/constants/mcpSecurity';

interface PackageVerificationResult {
  exists: boolean;
  isOfficial: boolean;
  isVerifying: boolean;
  error?: string;
}

/**
 * Hook to verify if an npm package exists and is official
 * Uses IPC to avoid CSP violations
 */
export function usePackageVerification(packageName: string | undefined): PackageVerificationResult {
  const [result, setResult] = useState<PackageVerificationResult>({
    exists: false,
    isOfficial: false,
    isVerifying: false
  });

  useEffect(() => {
    if (!packageName) {
      setResult({ exists: false, isOfficial: false, isVerifying: false });
      return;
    }

    // Check if it's an official package
    const isOfficial = OFFICIAL_MCP_PACKAGES.includes(packageName as any);

    // Start verification
    setResult({ exists: false, isOfficial, isVerifying: true });

    // Verify package exists on npm using IPC
    const verifyPackage = async () => {
      try {
        const response = await window.levante.mcp.verifyPackage(packageName);

        if (response.success && response.data) {
          setResult({
            exists: response.data.exists,
            isOfficial,
            isVerifying: false,
            error: response.data.exists ? undefined : 'Package not found on npm registry'
          });
        } else {
          setResult({
            exists: false,
            isOfficial,
            isVerifying: false,
            error: response.error || 'Failed to verify package'
          });
        }
      } catch (error) {
        setResult({
          exists: false,
          isOfficial,
          isVerifying: false,
          error: 'Failed to verify package'
        });
      }
    };

    verifyPackage();
  }, [packageName]);

  return result;
}
