import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSettings } from '../lib/format';
import type { Organization } from '../types';
import { Button, Card, ErrorBox, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui';

import { t } from '../lib/i18n';
const CURRENCIES = [
  ['EUR', t('Euro (€)')],
  ['DZD', t('Dinar algérien (DA)')],
  ['MAD', t('Dirham marocain (DH)')],
  ['TND', t('Dinar tunisien (DT)')],
  ['XOF', 'Franc CFA BCEAO'],
  ['XAF', 'Franc CFA BEAC'],
  ['CHF', t('Franc suisse')],
  ['CAD', t('Dollar canadien')],
  ['USD', t('Dollar US')],
  ['GBP', t('Livre sterling')],
];

type Form = Record<keyof Organization, string>;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useSettings();
  const [f, setF] = useState<Form | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !f) {
      setF(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === null ? '' : String(v)])) as Form);
    }
  }, [data, f]);

  const save = useMutation({
    mutationFn: (body: Form) =>
      api<Organization>('/settings', 'PUT', {
        name: body.name,
        legalForm: body.legalForm,
        taxId: body.taxId,
        registryNumber: body.registryNumber,
        email: body.email,
        phone: body.phone,
        address: body.address,
        city: body.city,
        country: body.country,
        currency: body.currency,
        defaultTaxRate: Number(body.defaultTaxRate),
        paymentTerms: Number(body.paymentTerms),
        bankDetails: body.bankDetails,
        documentFooter: body.documentFooter,
      }),
    onSuccess: (org) => {
      qc.setQueryData(['settings'], org);
      qc.invalidateQueries();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isLoading || !f) return <Spinner />;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(f);
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={t("Paramètres")}
        subtitle={t("Informations de votre entreprise, reprises sur les devis et factures")}
        actions={
          <>
            {saved && <span className="text-sm text-emerald-600">{t("Enregistré ✓")}</span>}
            <Button type="submit" loading={save.isPending}>
              {t("Enregistrer")}
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <ErrorBox error={save.error} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("Identité de l’entreprise")}>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Input label={t("Raison sociale *")} value={f.name} onChange={set('name')} required className="sm:col-span-2" />
            <Input label={t("Forme juridique")} value={f.legalForm} onChange={set('legalForm')} placeholder={t("SARL, SAS, EURL…")} />
            <Input label={t("Identifiant fiscal")} value={f.taxId} onChange={set('taxId')} placeholder={t("SIRET, NIF, ICE…")} />
            <Input label={t("N° registre du commerce")} value={f.registryNumber} onChange={set('registryNumber')} />
            <Input label={t("Téléphone")} value={f.phone} onChange={set('phone')} />
            <Input label={t("Email")} type="email" value={f.email} onChange={set('email')} className="sm:col-span-2" />
            <Input label={t("Adresse")} value={f.address} onChange={set('address')} className="sm:col-span-2" />
            <Input label={t("Ville")} value={f.city} onChange={set('city')} />
            <Input label={t("Pays")} value={f.country} onChange={set('country')} />
          </div>
        </Card>
        <Card title={t("Facturation")}>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Select label={t("Devise")} value={f.currency} onChange={set('currency')}>
              {CURRENCIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </Select>
            <Input label={t("TVA par défaut (%)")} type="number" min="0" max="100" step="0.01" value={f.defaultTaxRate} onChange={set('defaultTaxRate')} />
            <Input label={t("Délai de paiement (jours)")} type="number" min="0" max="365" value={f.paymentTerms} onChange={set('paymentTerms')} />
            <Textarea label={t("Coordonnées bancaires (RIB / IBAN)")} value={f.bankDetails} onChange={set('bankDetails')} className="sm:col-span-2" />
            <Textarea label={t("Mentions de pied de page")} value={f.documentFooter} onChange={set('documentFooter')} className="sm:col-span-2" />
          </div>
        </Card>
      </div>
    </form>
  );
}
