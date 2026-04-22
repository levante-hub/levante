import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/**
 * Listens for Cowork prerequisites provisioning events (PortableGit on
 * Windows, Python on all platforms) and surfaces progress as toasts.
 *
 * Mount once at the chat page level. The actual provisioning is triggered
 * in the main process when the first Cowork-mode stream starts.
 */
export function CoworkPrerequisitesStatus() {
  const { t } = useTranslation('chat');
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    const unsubscribe = window.levante.cowork.onPrerequisitesStatus((status) => {
      const dismissActive = () => {
        if (toastIdRef.current !== null) {
          toast.dismiss(toastIdRef.current);
          toastIdRef.current = null;
        }
      };

      switch (status.step) {
        case 'installing-gitbash': {
          dismissActive();
          toastIdRef.current = toast.loading(
            t(
              'cowork_prereq.installing_gitbash',
              'Preparing Cowork… downloading Git Bash portable (~54 MB). This only happens once.'
            ),
            { duration: Infinity }
          );
          break;
        }
        case 'ensuring-python': {
          dismissActive();
          toastIdRef.current = toast.loading(
            t(
              'cowork_prereq.ensuring_python',
              'Preparing Cowork… ensuring Python runtime is available.'
            ),
            { duration: Infinity }
          );
          break;
        }
        case 'ready': {
          dismissActive();
          if (status.warnings && status.warnings.length > 0) {
            toast.warning(
              t('cowork_prereq.ready_with_warnings', 'Cowork ready with warnings'),
              { description: status.warnings.join('\n') }
            );
          }
          break;
        }
        case 'error': {
          dismissActive();
          toast.error(
            t('cowork_prereq.error', 'Failed to prepare Cowork prerequisites'),
            {
              description: status.warnings?.join('\n'),
            }
          );
          break;
        }
        case 'checking':
        default:
          break;
      }
    });

    return () => {
      unsubscribe();
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
      }
    };
  }, [t]);

  return null;
}
