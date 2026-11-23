import { useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { normalizeHeader, parseCsv, readCsvFile } from '../lib/csv';
import { Button, ErrorBox, Modal } from './ui';

import { t } from '../lib/i18n';
import { useAuth } from '../lib/auth';
export type ImportEntity = 'contacts' | 'companies' | 'products';

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  synonyms: string[];
}

const FIELDS: Record<ImportEntity, FieldDef[]> = {
  contacts: [
    { key: 'firstName', label: t('Prénom'), synonyms: ['prenom', 'firstname', 'first', 'givenname', 'nomcomplet', 'fullname', 'contact'] },
    { key: 'lastName', label: t('Nom'), required: true, synonyms: ['nom', 'lastname', 'last', 'surname', 'familyname', 'nomdefamille'] },
    { key: 'email', label: t('Email'), synonyms: ['email', 'mail', 'courriel', 'adresseemail', 'emailaddress', 'email1'] },
    { key: 'phone', label: t('Téléphone'), synonyms: ['telephone', 'tel', 'phone', 'mobile', 'portable', 'gsm', 'phonenumber'] },
    { key: 'position', label: t('Fonction'), synonyms: ['fonction', 'poste', 'titre', 'position', 'jobtitle', 'title'] },
    { key: 'companyName', label: t('Entreprise'), synonyms: ['entreprise', 'societe', 'company', 'organisation', 'organization', 'raisonsociale', 'client'] },
    { key: 'status', label: t('Statut'), synonyms: ['statut', 'status', 'etat'] },
    { key: 'source', label: t('Source'), synonyms: ['source', 'origine', 'provenance', 'leadsource'] },
    { key: 'notes', label: t('Notes'), synonyms: ['notes', 'note', 'commentaire', 'commentaires', 'remarques', 'description'] },
  ],
  companies: [
    { key: 'name', label: t('Raison sociale'), required: true, synonyms: ['raisonsociale', 'nom', 'name', 'entreprise', 'societe', 'company', 'companyname', 'client'] },
    { key: 'taxId', label: t('Identifiant fiscal'), synonyms: ['identifiantfiscal', 'siret', 'siren', 'nif', 'ice', 'tva', 'numerotva', 'vat', 'taxid'] },
    { key: 'industry', label: t('Secteur'), synonyms: ['secteur', 'secteurdactivite', 'activite', 'industry', 'industrie'] },
    { key: 'size', label: t('Effectif'), synonyms: ['effectif', 'taille', 'size', 'salaries', 'employees'] },
    { key: 'email', label: t('Email'), synonyms: ['email', 'mail', 'courriel'] },
    { key: 'phone', label: t('Téléphone'), synonyms: ['telephone', 'tel', 'phone', 'standard'] },
    { key: 'website', label: t('Site web'), synonyms: ['siteweb', 'site', 'website', 'web', 'url'] },
    { key: 'address', label: t('Adresse'), synonyms: ['adresse', 'address', 'rue', 'street'] },
    { key: 'city', label: t('Ville'), synonyms: ['ville', 'city', 'commune', 'localite'] },
    { key: 'country', label: t('Pays'), synonyms: ['pays', 'country'] },
    { key: 'notes', label: t('Notes'), synonyms: ['notes', 'note', 'commentaire', 'remarques'] },
  ],
  products: [
    { key: 'name', label: t('Nom'), required: true, synonyms: ['nom', 'name', 'produit', 'designation', 'libelle', 'article', 'service'] },
    { key: 'sku', label: t('Référence'), synonyms: ['reference', 'ref', 'sku', 'code', 'codearticle'] },
    { key: 'description', label: t('Description'), synonyms: ['description', 'detail', 'details'] },
    { key: 'unit', label: t('Unité'), synonyms: ['unite', 'unit', 'uom'] },
    { key: 'unitPrice', label: t('Prix unitaire HT'), required: true, synonyms: ['prixunitaireht', 'prixht', 'prix', 'pu', 'puht', 'price', 'unitprice', 'tarif'] },
    { key: 'taxRate', label: t('TVA %'), synonyms: ['tva', 'tauxtva', 'tva%', 'vat', 'taxrate', 'tax'] },
  ],
};

const TITLES: Record<ImportEntity, string> = { contacts: t('Importer des contacts'), companies: t('Importer des entreprises'), products: t('Importer des produits') };

function autoMap(fields: FieldDef[], headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Record<string, number | null> = {};
  for (const f of fields) {
    const idx = normalized.findIndex((h, i) => !used.has(i) && (f.synonyms.includes(h) || h === normalizeHeader(f.label)));
    mapping[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

interface ImportResult {
  created: number;
  skipped: number;
  companiesCreated?: number;
  errors: { row: number; message: string }[];
}

export function CsvImport({ entity, onClose }: { entity: ImportEntity; onClose: () => void }) {
  const qc = useQueryClient();
  const fields = FIELDS[entity];
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [readError, setReadError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReadError(null);
    try {
      const parsed = parseCsv(await readCsvFile(file));
      if (!parsed.headers.length || !parsed.rows.length) throw new Error(t('Le fichier ne contient aucune ligne de données'));
      setFileName(file.name);
      setCsv(parsed);
      setMapping(autoMap(fields, parsed.headers));
      importMutation.reset();
    } catch (err) {
      setReadError(err instanceof Error ? err.message : t('Fichier illisible'));
    }
  };

  const records = useMemo(() => {
    if (!csv) return [];
    return csv.rows.map((r) => Object.fromEntries(fields.map((f) => [f.key, mapping[f.key] == null ? null : r[mapping[f.key]!] ?? null])));
  }, [csv, mapping, fields]);

  const missingRequired = fields.filter((f) => f.required && mapping[f.key] == null);

  const importMutation = useMutation({
    mutationFn: () => api<ImportResult>(`/import/${entity}`, 'POST', { rows: records }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const result = importMutation.data;

  const downloadTemplate = () => {
    const header = fields.map((f) => f.label).join(';');
    const blob = new Blob(['﻿' + header + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `modele-${entity}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal open onClose={onClose} title={TITLES[entity]} wide>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">{t("Import terminé")}</p>
              <p>
                {result.created} {t("créé(s) ·")} {result.skipped} {t("doublon(s) ignoré(s)")}
                {result.companiesCreated ? ` · ${t('{n} entreprise(s) créée(s)', { n: result.companiesCreated })}` : ''}
                {result.errors.length ? ` · ${t('{n} ligne(s) en erreur', { n: result.errors.length })}` : ''}
              </p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-red-200">
              <table className="w-full text-sm">
                <thead className="bg-red-50 text-left text-xs text-red-700">
                  <tr>
                    <th className="px-3 py-2">{t("Ligne")}</th>
                    <th className="px-3 py-2">{t("Erreur")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {result.errors.map((e) => (
                    <tr key={e.row}>
                      <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
                      <td className="px-3 py-1.5 text-red-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>{t("Fermer")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-indigo-400 hover:bg-indigo-50/40">
            <FileUp className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">{fileName || t('Choisir un fichier CSV')}</span>
            <span className="text-xs text-slate-500">{t("Export Excel (« CSV séparateur point-virgule »), Google Sheets ou autre CRM")}</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
          </label>
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
            <Download className="h-3.5 w-3.5" /> {t("Télécharger un modèle de fichier")}
          </button>
          <ErrorBox error={readError} />

          {csv && (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">{t("Correspondance des colonnes")}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {fields.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <span className="w-36 shrink-0 text-slate-600">
                        {f.label}
                        {f.required && <span className="text-red-500"> *</span>}
                      </span>
                      <select
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">{t("— Ignorer —")}</option>
                        {csv.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || t('Colonne {n}', { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {entity === 'contacts' && (
                  <p className="mt-2 text-xs text-slate-500">
                    {t("Les entreprises inconnues sont créées automatiquement. Un contact dont l’email existe déjà est ignoré. Si seule une colonne « nom complet » existe, associez-la à « Prénom » : elle sera découpée.")}
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">{t("Aperçu (")}{csv.rows.length} {t("ligne(s))")}</h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        {fields
                          .filter((f) => mapping[f.key] != null)
                          .map((f) => (
                            <th key={f.key} className="whitespace-nowrap px-2 py-1.5 font-medium">
                              {f.label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          {fields
                            .filter((f) => mapping[f.key] != null)
                            .map((f) => (
                              <td key={f.key} className="max-w-48 truncate whitespace-nowrap px-2 py-1.5 text-slate-700">
                                {String(r[f.key] ?? '')}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <ErrorBox error={importMutation.error} />
          {missingRequired.length > 0 && csv && <p className="text-sm text-amber-700">{t("Associez la colonne obligatoire :")} {missingRequired.map((f) => f.label).join(', ')}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("Annuler")}
            </Button>
            <Button onClick={() => importMutation.mutate()} disabled={!csv || missingRequired.length > 0} loading={importMutation.isPending}>
              <Upload className="h-4 w-4" /> {t("Importer")} {csv ? t('{n} ligne(s)', { n: csv.rows.length }) : ''}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Lien de téléchargement CSV (cookie de session envoyé automatiquement, même origine). */
export function ExportButton({ entity, label = t('Exporter') }: { entity: 'contacts' | 'companies' | 'deals' | 'invoices' | 'products'; label?: string }) {
  const { can } = useAuth();
  // Masqué sans le droit d'export
  if (!can('data.export')) return null;
  return (
    <a
      href={`/api/export/${entity}`}
      download
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <Download className="h-4 w-4" /> {label}
    </a>
  );
}
