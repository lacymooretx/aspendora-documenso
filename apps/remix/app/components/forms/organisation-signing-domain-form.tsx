import {
  CUSTOM_SIGNING_DOMAIN_MAX_LENGTH,
  isValidCustomSigningDomain,
} from '@documenso/lib/types/custom-signing-domain';
import { Button } from '@documenso/ui/primitives/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const ZSigningDomainFormSchema = z.object({
  customSigningDomain: z.string().trim().max(CUSTOM_SIGNING_DOMAIN_MAX_LENGTH).refine(isValidCustomSigningDomain, {
    message: 'Enter a valid domain, e.g. sign.example.com',
  }),
});

export type TSigningDomainFormSchema = z.infer<typeof ZSigningDomainFormSchema>;

export type OrganisationSigningDomainFormProps = {
  /** The organisation's current custom signing domain, or null if none. */
  customSigningDomain: string | null;
  /** Called with the normalised value (`null` when the field is cleared). */
  onFormSubmit: (customSigningDomain: string | null) => Promise<void>;
};

export const OrganisationSigningDomainForm = ({
  customSigningDomain,
  onFormSubmit,
}: OrganisationSigningDomainFormProps) => {
  const { t } = useLingui();

  const form = useForm<TSigningDomainFormSchema>({
    defaultValues: {
      customSigningDomain: customSigningDomain ?? '',
    },
    resolver: zodResolver(ZSigningDomainFormSchema),
  });

  const handleSubmit = async (data: TSigningDomainFormSchema) => {
    const trimmed = data.customSigningDomain.trim();

    await onFormSubmit(trimmed === '' ? null : trimmed);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <fieldset className="flex h-full max-w-2xl flex-col gap-y-6" disabled={form.formState.isSubmitting}>
          <FormField
            control={form.control}
            name="customSigningDomain"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Custom signing domain</Trans>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t`sign.example.com`} />
                </FormControl>
                <FormMessage />
                <FormDescription>
                  <Trans>
                    Signer-facing links (the signing page, report, and completion download) for this organisation's
                    documents are sent on this domain instead of the default one. Point the domain at this Documenso
                    instance first. Leave blank to use the default domain.
                  </Trans>{' '}
                  <span className="text-muted-foreground">
                    <Trans>
                      Note: staff sign-in and the dashboard always stay on the primary domain — only signer links use
                      this domain.
                    </Trans>
                  </span>
                </FormDescription>
              </FormItem>
            )}
          />

          <div className="flex flex-row justify-end space-x-4">
            <Button type="submit" loading={form.formState.isSubmitting}>
              <Trans>Update</Trans>
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
};
