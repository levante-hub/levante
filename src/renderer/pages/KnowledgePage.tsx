import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Upload, Database, FileText, CheckCircle, XCircle, Clock, AlertTriangle, Trash2 } from 'lucide-react';
import { useKnowledgeStore } from '@/stores/knowledgeStore';
import { useTranslation } from 'react-i18next';

const KnowledgePage = () => {
  const { t } = useTranslation('knowledge');
  const {
    documents,
    stats,
    isLoading,
    isUploading,
    error,
    initialize,
    uploadDocument,
    deleteDocument,
    deleteAllDocuments,
    clearError
  } = useKnowledgeStore();

  const [migrationStatus, setMigrationStatus] = useState<{
    needsMigration: boolean;
    currentVersion: number;
    expectedVersion: number;
  } | null>(null);
  const [isRunningMigration, setIsRunningMigration] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  // Check migration status on mount
  useEffect(() => {
    const checkMigration = async () => {
      try {
        const result = await window.levante.db.migrations.status();
        if (result.success && result.data) {
          setMigrationStatus(result.data);
        }
      } catch (error) {
        console.error('Failed to check migration status:', error);
      }
    };
    checkMigration();
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleRunMigration = async () => {
    try {
      setIsRunningMigration(true);
      setMigrationError(null);

      const result = await window.levante.db.migrations.run();

      if (result.success) {
        // Refresh migration status
        const statusResult = await window.levante.db.migrations.status();
        if (statusResult.success && statusResult.data) {
          setMigrationStatus(statusResult.data);
        }

        // Refresh documents list
        await initialize();
      } else {
        setMigrationError(result.error || 'Migration failed');
      }
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Migration error:', error);
    } finally {
      setIsRunningMigration(false);
    }
  };

  const handleUpload = async () => {
    try {
      // Use Electron's native file dialog
      const result = await window.levante.documents.pickFile();

      if (!result.success || !result.filePath || !result.filename) {
        if (result.error && !result.error.includes('canceled')) {
          console.error('File picker error:', result.error);
        }
        return;
      }

      // Upload the selected file
      await uploadDocument(result.filePath, result.filename);
    } catch (error) {
      console.error('Failed to upload document:', error);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (confirm(t('confirm_delete', { defaultValue: 'Are you sure you want to delete this document?' }))) {
      try {
        await deleteDocument(documentId);
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  const handleDeleteAllClick = () => {
    setShowDeleteAllDialog(true);
  };

  const handleConfirmDeleteAll = async () => {
    setShowDeleteAllDialog(false);
    try {
      await deleteAllDocuments();
    } catch (error) {
      console.error('Delete all error:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'indexed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500 animate-spin" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'indexed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {t('title', { defaultValue: 'Knowledge Base' })}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle', { defaultValue: 'Manage your documents for RAG-enhanced conversations' })}
          </p>
        </div>
        <div className="flex gap-2">
          {documents.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDeleteAllClick}
              disabled={isLoading || isUploading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('delete_all_button', { defaultValue: 'Delete All' })}
            </Button>
          )}
          <Button
            onClick={handleUpload}
            disabled={isUploading || isLoading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('uploading', { defaultValue: 'Uploading...' })}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t('upload_button', { defaultValue: 'Upload Document' })}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Warning */}
      {migrationStatus && migrationStatus.needsMigration && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <strong>Database Migration Required</strong>
              <p className="text-sm mt-1">
                The documents table is not initialized (current version: {migrationStatus.currentVersion},
                required: {migrationStatus.expectedVersion}). Click "Run Migration" to initialize the RAG system.
              </p>
            </div>
            <Button
              onClick={handleRunMigration}
              disabled={isRunningMigration}
              className="ml-4"
            >
              {isRunningMigration ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                'Run Migration'
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Error */}
      {migrationError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Migration failed: {migrationError}</span>
            <Button variant="ghost" size="sm" onClick={() => setMigrationError(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('stats.total', { defaultValue: 'Total Documents' })}
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('stats.indexed', { defaultValue: 'Indexed' })}
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.indexedDocuments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('stats.processing', { defaultValue: 'Processing' })}
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processingDocuments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('stats.chunks', { defaultValue: 'Total Chunks' })}
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalChunks}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Documents Grid */}
      <Card>
        <CardHeader>
          <CardTitle>{t('documents_title', { defaultValue: 'Documents' })}</CardTitle>
          <CardDescription>
            {t('documents_description', { defaultValue: 'Upload and manage documents for enhanced AI responses' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && documents.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {t('empty.title', { defaultValue: 'No documents yet' })}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t('empty.description', { defaultValue: 'Upload your first document to get started' })}
              </p>
              <Button onClick={handleUpload}>
                <Upload className="w-4 h-4 mr-2" />
                {t('upload_button', { defaultValue: 'Upload Document' })}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    {getStatusIcon(doc.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium truncate">{doc.filename}</p>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(doc.status)}`}
                        >
                          {doc.status}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                        <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                        <span>{doc.file_type.toUpperCase()}</span>
                        {doc.chunk_count > 0 && (
                          <span>{doc.chunk_count} chunks</span>
                        )}
                        <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                      </div>
                      {doc.error_message && (
                        <p className="text-sm text-red-500 mt-1">{doc.error_message}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    className="ml-4"
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete All Confirmation Dialog */}
      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <AlertDialogTitle>
                {t('delete_all_dialog.title', { defaultValue: 'Delete All Documents?' })}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {t('delete_all_dialog.warning', {
                defaultValue: `You are about to permanently delete ${documents.length} document${documents.length === 1 ? '' : 's'}.`
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground font-semibold text-destructive">
              {t('delete_all_dialog.description', {
                defaultValue: 'This action will:'
              })}
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>{t('delete_all_dialog.item1', { defaultValue: 'Remove all document files from storage' })}</li>
              <li>{t('delete_all_dialog.item2', { defaultValue: 'Delete all indexed chunks from the vector database' })}</li>
              <li>{t('delete_all_dialog.item3', { defaultValue: 'Clear all document metadata' })}</li>
            </ul>
            <p className="text-sm font-semibold text-destructive">
              {t('delete_all_dialog.irreversible', {
                defaultValue: 'This action cannot be undone.'
              })}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('delete_all_dialog.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteAll}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('delete_all_dialog.confirm', { defaultValue: 'Delete All Documents' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default KnowledgePage;
