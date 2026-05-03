import {
  FlowOperationType,
  FlowVersion,
  PopulatedFlow,
} from '@activepieces/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { flowsApi } from '@/features/flows';
import { projectCollectionUtils } from '@/features/projects';
import { authenticationSession } from '@/lib/authentication-session';

type CopyToEnvironmentDialogProps = {
  flow: PopulatedFlow;
  flowVersion: FlowVersion;
  children: React.ReactNode;
};

export const CopyToEnvironmentDialog: React.FC<
  CopyToEnvironmentDialogProps
> = ({ flow, flowVersion, children }) => {
  const [open, setOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string>('');
  const currentProjectId = authenticationSession.getProjectId();
  const { data: allProjects } = projectCollectionUtils.useAll();
  const otherProjects = allProjects.filter((p) => p.id !== currentProjectId);

  const { mutate: copyFlow, isPending } = useMutation({
    mutationFn: async () => {
      if (!targetProjectId) {
        throw new Error('No target environment selected');
      }
      const created = await flowsApi.create({
        displayName: flowVersion.displayName,
        projectId: targetProjectId,
      });
      return flowsApi.update(created.id, {
        type: FlowOperationType.IMPORT_FLOW,
        request: {
          displayName: flowVersion.displayName,
          trigger: flowVersion.trigger,
          schemaVersion: flowVersion.schemaVersion,
          notes: flowVersion.notes,
        },
      });
    },
    onSuccess: () => {
      const target = otherProjects.find((p) => p.id === targetProjectId);
      toast.success(t('Copied to {target}', { target: target?.displayName ?? 'environment' }));
      setOpen(false);
      setTargetProjectId('');
    },
    onError: () => {
      toast.error(t('Failed to copy flow to environment'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Copy to Environment')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t(
              'A new copy of this flow will be created in the selected environment.',
            )}
          </p>
          <Select value={targetProjectId} onValueChange={setTargetProjectId}>
            <SelectTrigger>
              <SelectValue placeholder={t('Select environment')} />
            </SelectTrigger>
            <SelectContent>
              {otherProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            disabled={!targetProjectId || isPending}
            onClick={() => copyFlow()}
          >
            {isPending && <LoadingSpinner className="mr-2" />}
            {t('Copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
