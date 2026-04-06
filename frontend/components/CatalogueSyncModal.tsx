'use client';

import { useState, useRef, useCallback } from 'react';
import api from '@/lib/api';

// --- Interfaces ---
interface SyncSummary {
  totalExcelRows: number;
  totalDbProducts: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  warningCount: number;
}

interface SyncProduct {
  rowIndex?: number;
  productName: string;
  brandName: string;
  basePrice: number;
  purchasePrice: number;
  quantity: number;
  qteParColis: number;
  qteColisParPalette: number;
  nbPalette: number;
  nbColis: number;
  calibre?: string | null;
  choix?: string | null;
  status: string;
  // update fields
  productId?: number;
  currentQty?: number;
  currentBasePrice?: number;
  currentPurchasePrice?: number;
  currentBrand?: string;
  qtyChanged?: boolean;
  basePriceChanged?: boolean;
  purchasePriceChanged?: boolean;
  hasChanges?: boolean;
  // remove fields
  pendingOrderCount?: number;
  hasPendingOrders?: boolean;
}

interface SyncWarning {
  productName: string;
  pendingOrderCount: number;
  message: string;
}

interface SyncAnalysisResult {
  syncSessionId: string;
  fileName: string;
  summary: SyncSummary;
  newProducts: SyncProduct[];
  updatedProducts: SyncProduct[];
  unchangedProducts: number;
  removedProducts: SyncProduct[];
  warnings: SyncWarning[];
}

interface CatalogueSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// --- Helper: Format number ---
const fmt = (n: number | undefined) => {
  if (n == null || isNaN(n)) return '0';
  return n.toLocaleString('fr-DZ', { maximumFractionDigits: 2 });
};

const fmtPrice = (n: number | undefined) => {
  if (n == null || isNaN(n)) return '0 DA';
  return n.toLocaleString('fr-DZ', { maximumFractionDigits: 2 }) + ' DA';
};

export default function CatalogueSyncModal({ isOpen, onClose, onComplete }: CatalogueSyncModalProps) {
  // State machine: 'upload' | 'analyzing' | 'preview' | 'executing' | 'done'
  const [step, setStep] = useState<'upload' | 'analyzing' | 'preview' | 'executing' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SyncAnalysisResult | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'updated' | 'removed'>('new');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset modal state
  const resetModal = useCallback(() => {
    setStep('upload');
    setFile(null);
    setError(null);
    setAnalysisResult(null);
    setExecutionResult(null);
    setActiveTab('new');
    setIsDragOver(false);
  }, []);

  const handleClose = () => {
    resetModal();
    onClose();
  };

  // File Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xls') || droppedFile.name.endsWith('.xlsx'))) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Format non supporté. Veuillez utiliser un fichier .xls ou .xlsx');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  // Phase 1: Analyze
  const handleAnalyze = async () => {
    if (!file) return;
    setStep('analyzing');
    setError(null);
    try {
      const result = await api.analyzeCatalogueSync(file);
      if (result.success) {
        setAnalysisResult(result.data);
        setStep('preview');
        // Auto-select the most relevant tab
        if (result.data.summary.newCount > 0) setActiveTab('new');
        else if (result.data.summary.updatedCount > 0) setActiveTab('updated');
        else if (result.data.summary.removedCount > 0) setActiveTab('removed');
      } else {
        setError(result.message || "Erreur lors de l'analyse du fichier.");
        setStep('upload');
      }
    } catch (err: any) {
      setError(err.message || "Erreur inattendue lors de l'analyse.");
      setStep('upload');
    }
  };

  // Phase 2: Execute
  const handleExecute = async () => {
    if (!analysisResult) return;
    setStep('executing');
    setError(null);
    try {
      const result = await api.executeCatalogueSync(analysisResult.syncSessionId, 1); // Warehouse 1 (Main)
      if (result.success) {
        setExecutionResult(result.data);
        setStep('done');
      } else {
        setError(result.message || "Erreur lors de la synchronisation.");
        setStep('preview');
      }
    } catch (err: any) {
      setError(err.message || "Erreur inattendue lors de la synchronisation.");
      setStep('preview');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
           style={{ animation: 'fadeIn 0.2s ease-out' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg shadow-md">
              📥
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Synchronisation du Catalogue</h2>
              <p className="text-xs text-slate-500">
                {step === 'upload' && 'Importez un fichier Excel pour synchroniser votre catalogue'}
                {step === 'analyzing' && 'Analyse en cours...'}
                {step === 'preview' && `${analysisResult?.fileName} — Prévisualisation des changements`}
                {step === 'executing' && 'Application des changements...'}
                {step === 'done' && 'Synchronisation terminée !'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-1 hover:bg-slate-100 rounded-lg transition">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Error banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm flex items-start gap-2">
              <span className="shrink-0">❌</span>
              <span>{error}</span>
            </div>
          )}

          {/* ============ STEP 1: UPLOAD ============ */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                  isDragOver ? 'border-indigo-400 bg-indigo-50 scale-[1.01]' :
                  file ? 'border-green-400 bg-green-50' :
                  'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {file ? (
                  <div>
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-lg font-semibold text-green-700">{file.name}</p>
                    <p className="text-sm text-green-600 mt-1">{(file.size / 1024).toFixed(1)} KB — Prêt pour l'analyse</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="mt-3 text-sm text-red-500 hover:text-red-700 underline"
                    >
                      Changer de fichier
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-5xl mb-3">📄</div>
                    <p className="text-lg font-semibold text-slate-700">Glissez votre fichier Excel ici</p>
                    <p className="text-sm text-slate-500 mt-1">ou cliquez pour sélectionner un fichier</p>
                    <p className="text-xs text-slate-400 mt-3">Formats acceptés: .xls, .xlsx</p>
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">💡 Comment ça marche ?</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>1. Le fichier est analysé et comparé avec votre catalogue actuel</li>
                  <li>2. Vous voyez un rapport détaillé des changements avant toute modification</li>
                  <li>3. Nouveaux produits, mises à jour de quantités, et produits à supprimer</li>
                  <li>4. Rien ne change tant que vous n'avez pas confirmé</li>
                </ul>
              </div>
            </div>
          )}

          {/* ============ STEP 2: ANALYZING ============ */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
              <p className="text-lg font-semibold text-slate-700">Analyse en cours...</p>
              <p className="text-sm text-slate-500 mt-2">Comparaison du fichier Excel avec votre catalogue</p>
            </div>
          )}

          {/* ============ STEP 3: PREVIEW ============ */}
          {step === 'preview' && analysisResult && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-600">{analysisResult.summary.newCount}</p>
                  <p className="text-xs font-medium text-emerald-700 mt-1">Nouveaux Produits</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{analysisResult.summary.updatedCount}</p>
                  <p className="text-xs font-medium text-blue-700 mt-1">Produits Modifiés</p>
                </div>
                <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-slate-500">{analysisResult.summary.unchangedCount}</p>
                  <p className="text-xs font-medium text-slate-600 mt-1">Inchangés</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{analysisResult.summary.removedCount}</p>
                  <p className="text-xs font-medium text-red-700 mt-1">À Supprimer</p>
                </div>
              </div>

              {/* Warnings */}
              {analysisResult.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Attention — Commandes en cours détectées</p>
                  <div className="space-y-1">
                    {analysisResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700">{w.message}</p>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 mt-2 italic">Ces produits seront désactivés mais les commandes en cours resteront intactes.</p>
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('new')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                    activeTab === 'new' ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  🟢 Nouveaux ({analysisResult.summary.newCount})
                </button>
                <button
                  onClick={() => setActiveTab('updated')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                    activeTab === 'updated' ? 'border-blue-500 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  🔵 Modifiés ({analysisResult.summary.updatedCount})
                </button>
                <button
                  onClick={() => setActiveTab('removed')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                    activeTab === 'removed' ? 'border-red-500 text-red-700 bg-red-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  🔴 Supprimés ({analysisResult.summary.removedCount})
                </button>
              </div>

              {/* Tab Content */}
              <div className="max-h-[40vh] overflow-auto rounded-xl border border-slate-200">

                {/* NEW PRODUCTS TABLE */}
                {activeTab === 'new' && (
                  analysisResult.newProducts.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-emerald-50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 text-xs font-semibold text-emerald-700">Produit</th>
                          <th className="text-left p-3 text-xs font-semibold text-emerald-700">Marque</th>
                          <th className="text-right p-3 text-xs font-semibold text-emerald-700">Prix Vente</th>
                          <th className="text-right p-3 text-xs font-semibold text-emerald-700">Prix Achat</th>
                          <th className="text-right p-3 text-xs font-semibold text-emerald-700">Qté</th>
                          <th className="text-right p-3 text-xs font-semibold text-emerald-700">Qté/Crt</th>
                          <th className="text-right p-3 text-xs font-semibold text-emerald-700">Crt/Pal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.newProducts.map((p, i) => (
                          <tr key={i} className="border-t border-slate-100 hover:bg-emerald-50/30">
                            <td className="p-3 font-medium text-slate-800">{p.productName}</td>
                            <td className="p-3 text-slate-600">{p.brandName}</td>
                            <td className="p-3 text-right text-slate-700">{fmtPrice(p.basePrice)}</td>
                            <td className="p-3 text-right text-slate-700">{fmtPrice(p.purchasePrice)}</td>
                            <td className="p-3 text-right font-semibold text-emerald-700">{fmt(p.quantity)}</td>
                            <td className="p-3 text-right text-slate-600">{fmt(p.qteParColis)}</td>
                            <td className="p-3 text-right text-slate-600">{fmt(p.qteColisParPalette)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-500">Aucun nouveau produit détecté</div>
                  )
                )}

                {/* UPDATED PRODUCTS TABLE */}
                {activeTab === 'updated' && (
                  analysisResult.updatedProducts.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 text-xs font-semibold text-blue-700">Produit</th>
                          <th className="text-right p-3 text-xs font-semibold text-blue-700">Quantité</th>
                          <th className="text-right p-3 text-xs font-semibold text-blue-700">Prix Vente</th>
                          <th className="text-right p-3 text-xs font-semibold text-blue-700">Prix Achat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.updatedProducts.map((p, i) => (
                          <tr key={i} className="border-t border-slate-100 hover:bg-blue-50/30">
                            <td className="p-3 font-medium text-slate-800">{p.productName}</td>
                            <td className="p-3 text-right">
                              {p.qtyChanged ? (
                                <span>
                                  <span className="text-slate-400 line-through mr-1">{fmt(p.currentQty)}</span>
                                  <span className="text-blue-700 font-bold">→ {fmt(p.quantity)}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">{fmt(p.quantity)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {p.basePriceChanged ? (
                                <span>
                                  <span className="text-slate-400 line-through mr-1">{fmt(p.currentBasePrice)}</span>
                                  <span className="text-blue-700 font-bold">→ {fmt(p.basePrice)}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">{fmtPrice(p.basePrice)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {p.purchasePriceChanged ? (
                                <span>
                                  <span className="text-slate-400 line-through mr-1">{fmt(p.currentPurchasePrice)}</span>
                                  <span className="text-blue-700 font-bold">→ {fmt(p.purchasePrice)}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">{fmtPrice(p.purchasePrice)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-500">Aucune modification détectée</div>
                  )
                )}

                {/* REMOVED PRODUCTS TABLE */}
                {activeTab === 'removed' && (
                  analysisResult.removedProducts.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 text-xs font-semibold text-red-700">Produit</th>
                          <th className="text-left p-3 text-xs font-semibold text-red-700">Marque</th>
                          <th className="text-right p-3 text-xs font-semibold text-red-700">Stock Actuel</th>
                          <th className="text-right p-3 text-xs font-semibold text-red-700">Prix Vente</th>
                          <th className="text-center p-3 text-xs font-semibold text-red-700">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.removedProducts.map((p, i) => (
                          <tr key={i} className={`border-t border-slate-100 hover:bg-red-50/30 ${p.hasPendingOrders ? 'bg-amber-50/50' : ''}`}>
                            <td className="p-3 font-medium text-slate-800">{p.productName}</td>
                            <td className="p-3 text-slate-600">{p.brandName}</td>
                            <td className="p-3 text-right text-slate-700">{fmt(p.currentQty)}</td>
                            <td className="p-3 text-right text-slate-700">{fmtPrice(p.currentBasePrice)}</td>
                            <td className="p-3 text-center">
                              {p.hasPendingOrders ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                  ⚠️ {p.pendingOrderCount} cmd
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  Sera supprimé
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-500">Aucun produit à supprimer</div>
                  )
                )}
              </div>
            </div>
          )}

          {/* ============ STEP 4: EXECUTING ============ */}
          {step === 'executing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-6"></div>
              <p className="text-lg font-semibold text-slate-700">Synchronisation en cours...</p>
              <p className="text-sm text-slate-500 mt-2">Veuillez ne pas fermer cette fenêtre</p>
              <div className="mt-4 flex gap-2 text-xs text-slate-400">
                <span>Création des nouveaux produits</span>
                <span>•</span>
                <span>Mise à jour des quantités</span>
                <span>•</span>
                <span>Suppression des anciens</span>
              </div>
            </div>
          )}

          {/* ============ STEP 5: DONE ============ */}
          {step === 'done' && executionResult && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="text-5xl mb-4">🎉</div>
                <p className="text-xl font-bold text-slate-800">Synchronisation terminée !</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-600">{executionResult.created}</p>
                  <p className="text-xs font-medium text-emerald-700">Produits Créés</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{executionResult.updated}</p>
                  <p className="text-xs font-medium text-blue-700">Produits Mis à Jour</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{executionResult.removed}</p>
                  <p className="text-xs font-medium text-red-700">Produits Supprimés</p>
                </div>
              </div>

              {executionResult.errors?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Erreurs ({executionResult.errors.length})</p>
                  <div className="max-h-32 overflow-auto space-y-1">
                    {executionResult.errors.map((err: any, i: number) => (
                      <p key={i} className="text-xs text-amber-700">
                        [{err.action}] {err.product}: {err.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-400">
            {step === 'preview' && analysisResult && (
              <span>
                {analysisResult.summary.totalExcelRows} produits Excel • {analysisResult.summary.totalDbProducts} produits en base
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {step === 'upload' && (
              <>
                <button onClick={handleClose} className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-medium text-sm transition shadow-sm">
                  Annuler
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={!file}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 rounded-xl font-medium text-sm transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  🔍 Analyser le fichier
                </button>
              </>
            )}

            {step === 'preview' && (
              <>
                <button onClick={() => { resetModal(); }} className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-medium text-sm transition shadow-sm">
                  ← Recommencer
                </button>
                <button
                  onClick={handleExecute}
                  disabled={analysisResult?.summary.newCount === 0 && analysisResult?.summary.updatedCount === 0 && analysisResult?.summary.removedCount === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 rounded-xl font-medium text-sm transition shadow-md disabled:opacity-40 flex items-center gap-2"
                >
                  ✅ Confirmer et Synchroniser
                </button>
              </>
            )}

            {step === 'done' && (
              <button
                onClick={() => { handleClose(); onComplete(); }}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 rounded-xl font-medium text-sm transition shadow-md flex items-center gap-2"
              >
                ✓ Fermer et Rafraîchir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
