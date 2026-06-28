import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Trash2, 
  Save, 
  FileDown, 
  FileUp, 
  RefreshCw, 
  Printer, 
  TrendingDown, 
  CheckCircle, 
  DollarSign, 
  Calendar, 
  Layers, 
  Check, 
  X, 
  Copy, 
  PlusCircle, 
  Award, 
  Star, 
  HelpCircle, 
  BarChart, 
  FileText, 
  Briefcase, 
  FileSpreadsheet, 
  Clock, 
  GripVertical,
  File,
  Paperclip,
  UploadCloud,
  Eye,
  Download,
  AlertTriangle
} from "lucide-react";
import { doc, setDoc, getDocs, collection, deleteDoc } from "firebase/firestore";
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from "./firebase";
import { QuoteProject, Category, CostComponent, Vendor, UploadedFile, MonthlyCostTrackerRow, QualitativeRow } from "./types";
import { DEFAULT_PROJECTS, CURRENCY_SYMBOLS, CATEGORY_COLORS } from "./sampleData";

export default function App() {
  // State for all comparisons projects
  const [projects, setProjects] = useState<QuoteProject[]>(() => {
    const saved = localStorage.getItem("quote_compare_projects");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved projects", e);
      }
    }
    return DEFAULT_PROJECTS;
  });

  // Active project ID
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects[0]?.id || "project-1";
  });

  const [showGrandTotalBreakdown, setShowGrandTotalBreakdown] = useState<boolean>(true);

  // Expanded One-Year cost trackers status mapped by: expandedTrackers[catId][compId] = boolean
  const [expandedTrackers, setExpandedTrackers] = useState<Record<string, Record<string, boolean>>>({});

  // Active vendor selection inside cost trackers: trackerVendorSelections[`${catId}-${compId}`] = vendorId
  const [trackerVendorSelections, setTrackerVendorSelections] = useState<Record<string, string>>({});

  // Modal Fallback tracker state (e.g. if they trigger editing in transposed layout where rows are vendors)
  const [modalTrackerInfo, setModalTrackerInfo] = useState<{ catId: string; compId: string; compName: string } | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isUnsavedCloud, setIsUnsavedCloud] = useState(false);
  
  const [isQuotaExceededState, setIsQuotaExceededState] = useState<boolean>(() => {
    return localStorage.getItem("firebase_quota_exceeded") === "true";
  });

  const isQuotaExceeded = isQuotaExceededState;
  const setIsQuotaExceeded = (val: boolean) => {
    setIsQuotaExceededState(val);
    if (val) {
      localStorage.setItem("firebase_quota_exceeded", "true");
    } else {
      localStorage.removeItem("firebase_quota_exceeded");
    }
  };

  // Selected project object
  const project = projects.find((p) => p.id === activeProjectId) || projects[0];

  const saveToCloud = async (silent = false) => {
    if (!isFirebaseConfigured || !db) {
      if (!silent) {
        showToast("Firebase is not configured yet.", "error");
      }
      return;
    }

    // If quota was previously exceeded, skip silent automated background saves to prevent console spam
    if (silent && isQuotaExceeded) {
      console.log("Firestore write quota previously exhausted. Skipping automated background sync to prevent error spam.");
      return;
    }

    setIsSyncing(true);
    try {
      const savePromise = (async () => {
        for (const p of projects) {
          await setDoc(doc(db, "projects", p.id), p);
        }
      })();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout: Firestore write is hanging, likely due to write quota exhaustion.")), 3000);
      });

      await Promise.race([savePromise, timeoutPromise]);

      setIsUnsavedCloud(false);
      setIsSyncing(false);
      setIsQuotaExceeded(false); // Reset quota status flag on safe success
      if (!silent) {
        showToast("Data synced to cloud successfully!", "success");
      } else {
        console.log("Cloud autosave sync completed successfully.");
      }
    } catch (err: any) {
      setIsSyncing(false);
      console.error("Failed to sync project dataset to Firebase:", err);
      
      const errMsg = err?.message || String(err);
      const isQuotaErr = 
        errMsg.includes("resource-exhausted") || 
        errMsg.includes("Quota exceeded") || 
        errMsg.includes("Timeout") ||
        err?.code === "resource-exhausted";
      
      if (isQuotaErr) {
        setIsQuotaExceeded(true);
        if (!silent) {
          showToast("Cloud storage quota exceeded. Changes saved locally!", "error");
        } else {
          console.warn("Cloud write quota exceeded. Standard local fallback remains fully active.");
        }
      } else {
        if (!silent) {
          showToast("Cloud sync failed. High latency/unauthorized.", "error");
        }
      }
    }
  };

  // Load projects from Firebase on mount
  useEffect(() => {
    if (!isFirebaseConfigured || !db || isQuotaExceeded) return;

    const fetchProjects = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "projects"));
        const fbProjects: QuoteProject[] = [];
        querySnapshot.forEach((docSnap) => {
          fbProjects.push(docSnap.data() as QuoteProject);
        });
        if (fbProjects.length > 0) {
          setProjects(prev => {
            const fbIds = new Set(fbProjects.map(p => p.id));
            const uniqueLocals = prev.filter(p => !fbIds.has(p.id));
            const allProjects = [...fbProjects, ...uniqueLocals];
            
            // Check if active project exists in the merged list, and default if not
            const currentExist = allProjects.some(p => p.id === activeProjectId);
            if (!currentExist && allProjects.length > 0) {
              setActiveProjectId(allProjects[0].id);
            }
            return allProjects;
          });
          console.log("Projects successfully synchronized from Firebase (merged with local projects).");
        }
      } catch (err: any) {
        console.error("Error fetching projects from Firebase:", err);
        const errMsg = err?.message || String(err);
        if (errMsg.includes("resource-exhausted") || errMsg.includes("Quota exceeded") || err?.code === "resource-exhausted") {
          setIsQuotaExceeded(true);
        }
      }
    };

    fetchProjects();
  }, []);

  // Save projects to localStorage and mark cloud dirty on change (skipping initial empty state loading)
  const isInitialProjectsLoad = useRef(true);
  useEffect(() => {
    localStorage.setItem("quote_compare_projects", JSON.stringify(projects));
    
    if (isInitialProjectsLoad.current) {
      isInitialProjectsLoad.current = false;
    } else {
      setIsUnsavedCloud(true);
    }
  }, [projects]);

  // Cloud autosave disabled due to Firestore write quota exhaustion.
  // We rely fully on local storage backup to prevent trailing sync errors.

  // Helper to dynamically calculate maximum TCO years based on modern components names
  const getMaximumAvailableYearsCount = (p: QuoteProject): number => {
    return 3; // Capped at exactly 3 years maximum as requested
  };

  const maxYearsCount = getMaximumAvailableYearsCount(project);
  // Get active TCO years, either saved project choice or fallback capped at upper bound
  const tcoYears = Math.min(project.tcoYears || 3, maxYearsCount);
  const setTcoYears = (val: number) => {
    updateCurrentProject({ ...project, tcoYears: val });
  };

  // Table orientation layout (false = Cost Components as Rows, true = Vendors as Rows)
  const transposeMatrix = project.transposeMatrix || false;
  const setTransposeMatrix = (val: boolean) => {
    updateCurrentProject({ ...project, transposeMatrix: val });
  };

  const [activePerspective, setActivePerspective] = useState<"matrix" | "vendor">("matrix");

  // Drag and drop states
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [draggedComponentInfo, setDraggedComponentInfo] = useState<{ catId: string; compIndex: number } | null>(null);

  const handleCategoryDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCategoryIndex(index);
    e.dataTransfer.effectAllowed = "move";
    setDraggedComponentInfo(null);
  };

  const handleCategoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleCategoryDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedCategoryIndex === null || draggedCategoryIndex === targetIndex) return;

    const updatedCategories = [...project.categories];
    const [removed] = updatedCategories.splice(draggedCategoryIndex, 1);
    updatedCategories.splice(targetIndex, 0, removed);

    const updatedProject = {
      ...project,
      categories: updatedCategories,
    };
    updateCurrentProject(updatedProject);
    setDraggedCategoryIndex(null);
    showToast("Reordered categories!");
  };

  const handleComponentDragStart = (e: React.DragEvent, catId: string, compIndex: number) => {
    e.stopPropagation();
    setDraggedComponentInfo({ catId, compIndex });
    setDraggedCategoryIndex(null);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleComponentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleComponentDrop = (e: React.DragEvent, targetCatId: string, targetCompIndex: number) => {
    e.preventDefault();
    if (!draggedComponentInfo) return;
    const { catId: sourceCatId, compIndex: sourceCompIndex } = draggedComponentInfo;

    if (sourceCatId === targetCatId) {
      if (sourceCompIndex === targetCompIndex) {
        setDraggedComponentInfo(null);
        return;
      }
      
      const updatedCategories = project.categories.map(cat => {
        if (cat.id === targetCatId) {
          const comps = [...cat.components];
          const [removed] = comps.splice(sourceCompIndex, 1);
          comps.splice(targetCompIndex, 0, removed);
          return { ...cat, components: comps };
        }
        return cat;
      });

      const updatedProject = {
        ...project,
        categories: updatedCategories
      };
      updateCurrentProject(updatedProject);
      showToast("Reordered cost components!");
    } else {
      const sourceCat = project.categories.find(c => c.id === sourceCatId);
      const targetCat = project.categories.find(c => c.id === targetCatId);
      if (!sourceCat || !targetCat) return;

      const sourceComps = [...sourceCat.components];
      const [removed] = sourceComps.splice(sourceCompIndex, 1);

      const targetComps = [...targetCat.components];
      targetComps.splice(targetCompIndex, 0, removed);

      const updatedCategories = project.categories.map(cat => {
        if (cat.id === sourceCatId) {
          return { ...cat, components: sourceComps };
        }
        if (cat.id === targetCatId) {
          return { ...cat, components: targetComps };
        }
        return cat;
      });

      const updatedProject = {
        ...project,
        categories: updatedCategories
      };
      updateCurrentProject(updatedProject);
      showToast(`Moved "${removed.name}" to category "${targetCat.name}"!`);
    }

    setDraggedComponentInfo(null);
  };

  // UI state
  const [editingField, setEditingField] = useState<{
    type: "project-name" | "project-date" | "project-version" | "vendor-name" | "category-name" | "component-name" | "criteria-name" | "criteria-desc" | null;
    id?: string;
    subId?: string;
    catId?: string;
  }>({ type: null });

  const [editValue, setEditValue] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quotes File Attachment Vault States & Handlers
  const fileVaultRef = useRef<HTMLInputElement>(null);
  const [activeViewFile, setActiveViewFile] = useState<UploadedFile | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
    let files: FileList | null = null;
    if ("files" in e.target && e.target.files) {
      files = e.target.files;
    } else if (e && "dataTransfer" in e && e.dataTransfer && e.dataTransfer.files) {
      files = e.dataTransfer.files;
    }
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // 1.5MB Safe Guard to safeguard Firestore document limits
      if (file.size > 1.5 * 1024 * 1024) {
        setToast({ message: `"${file.name}" is too large. Please limit attachment sizes to 1MB.`, type: "error" });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const newFile: UploadedFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          base64,
          uploadedAt: new Date().toLocaleDateString()
        };

        const updatedFiles = [...(project.uploadedFiles || []), newFile];
        const updatedProject = {
          ...project,
          uploadedFiles: updatedFiles
        };
        updateCurrentProject(updatedProject);
        setToast({ message: `Uploaded "${file.name}" to attachments!`, type: "success" });
      };
      reader.readAsDataURL(file);
    });
  };

  const downloadFile = (file: UploadedFile) => {
    try {
      const link = document.createElement("a");
      link.href = file.base64;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setToast({ message: "Download failed. File may be corrupted.", type: "error" });
    }
  };

  const deleteUploadedFile = (fileId: string) => {
    const updatedFiles = (project.uploadedFiles || []).filter(f => f.id !== fileId);
    const updatedProject = {
      ...project,
      uploadedFiles: updatedFiles
    };
    updateCurrentProject(updatedProject);
    setToast({ message: "Attachment removed.", type: "info" });
  };

  const getFilesForVendor = (vendorId: string) => {
    return (project.uploadedFiles || []).filter(f => f.vendorId === vendorId);
  };

  const handleVendorFileUpload = (vendorId: string, ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: any) => {
      // 1MB restriction to safeguard Firestore
      if (file.size > 1.0 * 1024 * 1024) {
        setToast({ message: `"${file.name}" is too large. Please limit vendor attachments to 1MB.`, type: "error" });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const newFile: UploadedFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          base64,
          uploadedAt: new Date().toLocaleDateString(),
          vendorId: vendorId
        };

        const updatedFiles = [...(project.uploadedFiles || []), newFile];
        const updatedProject = {
          ...project,
          uploadedFiles: updatedFiles
        };
        updateCurrentProject(updatedProject);
        setToast({ message: `Uploaded "${file.name}" and linked to vendor!`, type: "success" });
      };
      reader.readAsDataURL(file);
    });
  };

  // Helper to decode base64 text for viewing
  const getDecodedText = (base64Str: string) => {
    try {
      const arr = base64Str.split(",");
      const b64 = arr[1] || arr[0];
      return atob(b64);
    } catch (err) {
      return "Unable to decode raw data format. Please download and view locally.";
    }
  };

  // Quick rating stars state for each vendor in the current project
  // We can save qualitative ratings inside the project object.
  // To avoid breaking the typescript model, let's add it dynamically or store it in project state
  // We'll extend our calculations. We'll store ratings inside localStorage or as custom fields in the values
  // Let's store ratings inside local React state or attach scorecards to project. We'll add standard scorecards
  // directly in the project object. Let's make sure it operates gracefully even for imported projects that might not have it yet.
  const [scorecards, setScorecards] = useState<Record<string, Record<string, Record<string, number>>>>(() => {
    const saved = localStorage.getItem("quote_compare_scorecards");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    // Default scorecards: [projectId][vendorId][criteria] = rating (1-5)
    return {
      "project-1": {
        "vendor-a": { technical: 4, support: 5, ease: 3, value: 4 },
        "vendor-b": { technical: 5, support: 4, ease: 4, value: 3 },
        "vendor-c": { technical: 2, support: 2, ease: 5, value: 4 },
        "vendor-new": { technical: 1, support: 1, ease: 1, value: 1 },
      }
    };
  });

  useEffect(() => {
    localStorage.setItem("quote_compare_scorecards", JSON.stringify(scorecards));
  }, [scorecards]);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // State update helper functions
  const updateCurrentProject = (updated: QuoteProject) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  // Auto-clone dynamic TCO cloned cost components for Year 2 and Year 3
  const autoCloneAnnualCosts = (currentProj: QuoteProject): { updated: QuoteProject; changed: boolean } => {
    let changed = false;
    const duration = currentProj.tcoYears || 1;
    if (duration < 2) return { updated: currentProj, changed: false };

    const updatedCostValues = JSON.parse(JSON.stringify(currentProj.costValues));
    let mainChanged = false;

    const updatedCategories = currentProj.categories.map(cat => {
      let comps = [...cat.components];
      let catChanged = false;

      cat.components.forEach(comp => {
        const nameLower = comp.name.toLowerCase();
        // Look for the exact phrase "annual cost" (case-insensitive)
        const isAnnualCost = nameLower.includes("annual cost");
        if (!isAnnualCost) return;

        // Check if only year 1 is there (either contains "year 1" / "yr 1" / "y1" or is generic without other years present)
        const isY1 = nameLower.includes("year 1") || nameLower.includes("yr 1") || nameLower.includes("y1") ||
          (!nameLower.includes("year 2") && !nameLower.includes("year 3") && 
           !nameLower.includes("yr 2") && !nameLower.includes("yr 3") &&
           !nameLower.includes("y2") && !nameLower.includes("y3"));

        if (!isY1) return;

        // Deterministic target IDs for Year 2 and Year 3 clones
        const y2Id = `${comp.id}-year-2`;
        const y3Id = `${comp.id}-year-3`;

        // Let's check for Year 2
        if (duration >= 2) {
          const hasY2 = comps.some(c => c.id === y2Id || 
            (c.name.toLowerCase().includes("annual cost") && 
             (c.name.toLowerCase().includes("year 2") || c.name.toLowerCase().includes("yr 2") || c.name.toLowerCase().includes("y2")))
          );

          if (!hasY2) {
            const y2Name = comp.name
              .replace(/year\s*1/i, "Year 2")
              .replace(/yr\s*1/i, "Yr 2")
              .replace(/y1/i, "Y2") + (comp.name.toLowerCase().includes("year") || comp.name.toLowerCase().includes("yr") ? "" : " Year 2");
            
            const idx = comps.findIndex(c => c.id === comp.id);
            if (idx !== -1) {
              comps.splice(idx + 1, 0, { id: y2Id, name: y2Name });
              catChanged = true;
              mainChanged = true;

              // Clone cost values for all vendors
              if (!updatedCostValues[cat.id]) updatedCostValues[cat.id] = {};
              updatedCostValues[cat.id][y2Id] = {};
              currentProj.vendors.forEach(v => {
                const baseVal = updatedCostValues[cat.id]?.[comp.id]?.[v.id] ?? 0;
                updatedCostValues[cat.id][y2Id][v.id] = baseVal;
              });
            }
          }
        }

        // Let's check for Year 3
        if (duration >= 3) {
          const hasY3 = comps.some(c => c.id === y3Id || 
            (c.name.toLowerCase().includes("annual cost") && 
             (c.name.toLowerCase().includes("year 3") || c.name.toLowerCase().includes("yr 3") || c.name.toLowerCase().includes("y3")))
          );

          if (!hasY3) {
            const y3Name = comp.name
              .replace(/year\s*1/i, "Year 3")
              .replace(/yr\s*1/i, "Yr 3")
              .replace(/y1/i, "Y3") + (comp.name.toLowerCase().includes("year") || comp.name.toLowerCase().includes("yr") ? "" : " Year 3");

            // Insert after Year 2 if it was just added, or after comp
            let idx = comps.findIndex(c => c.id === y2Id);
            if (idx === -1) {
              idx = comps.findIndex(c => c.id === comp.id);
            }
            if (idx !== -1) {
              comps.splice(idx + 1, 0, { id: y3Id, name: y3Name });
              catChanged = true;
              mainChanged = true;

              // Clone cost values for all vendors
              if (!updatedCostValues[cat.id]) updatedCostValues[cat.id] = {};
              updatedCostValues[cat.id][y3Id] = {};
              currentProj.vendors.forEach(v => {
                const baseVal = updatedCostValues[cat.id]?.[comp.id]?.[v.id] ?? 0;
                updatedCostValues[cat.id][y3Id][v.id] = baseVal;
              });
            }
          }
        }
      });

      if (catChanged) {
        return {
          ...cat,
          components: comps
        };
      }
      return cat;
    });

    if (mainChanged) {
      return {
        updated: {
          ...currentProj,
          categories: updatedCategories,
          costValues: updatedCostValues
        },
        changed: true
      };
    }
    return { updated: currentProj, changed: false };
  };

  // Watch for annual costs requiring auto cloning on project changes
  useEffect(() => {
    if (!project) return;
    const { updated, changed } = autoCloneAnnualCosts(project);
    if (changed) {
      setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
      setIsUnsavedCloud(true);
    }
  }, [project?.id, project?.tcoYears, project?.categories, project?.vendors]);

  // Formatting helper
  const formatCurrency = (amount: number) => {
    const symbol = CURRENCY_SYMBOLS[project.currency] || "$";
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const showDualConversion = (amount: number, customClass = "") => {
    if (amount === undefined || amount === null || isNaN(amount) || amount === 0) return null;
    const isUSD = project.currency === "USD";
    const converted = isUSD ? amount * 3.6725 : amount / 3.6725;
    const formatted = isUSD 
      ? `AED ${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` 
      : `$${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    
    const styleClass = customClass || "text-[10px] text-slate-400 font-mono font-medium drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] leading-none mt-0.5 select-none text-right block pr-1";
    return (
      <span className={styleClass}>
        {formatted}
      </span>
    );
  };

  const formatDateDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      return `${day}/${month}/${year}`;
    }
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch (e) {}
    return dateStr;
  };

  // Helper to determine annual scaling factor
  const getComponentScaleFactor = (compName: string, compId: string, duration: number, categoryComponents?: CostComponent[]): number => {
    const nameLower = compName.toLowerCase();
    const idLower = compId.toLowerCase();
    
    const isAnnual = 
      nameLower.includes("annual") || 
      nameLower.includes("recurring") || 
      nameLower.includes("yearly") || 
      nameLower.includes("subscription") ||
      nameLower.includes("per year") ||
      idLower.includes("annual") ||
      idLower.includes("recurring") ||
      idLower.includes("subscription");

    if (!isAnnual) return 1;

    // Try to extract Year/Yr N
    const match = compName.match(/(?:Year|Yr|Y)\s*(\d+)/i) || compId.match(/(?:year|yr|y)-?(\d+)/i);
    if (match) {
      const yearNum = parseInt(match[1], 10);
      if (yearNum > duration) {
        return 0; // Out of dynamic TCO range
      }
      return 1; // Within range
    }

    // Generic annual components (e.g. "Annual Support Fee") with no specific year suffix
    return duration;
  };

  // Calculated utilities
  // Scorecard rating average
  const getVendorScorecardAvg = (venId: string): number => {
    const currentCriteria = project.criteria || [
      { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
      { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
      { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
      { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
    ];
    const pScores = scorecards[project.id]?.[venId] || {};
    let sum = 0;
    let count = 0;
    currentCriteria.forEach(crit => {
      const val = pScores[crit.id] ?? 0;
      if (val > 0) {
        sum += val;
        count++;
      }
    });
    if (count === 0) return 0;
    return Number((sum / count).toFixed(1));
  };

  const isComponentExcluded = (catId: string, compId: string): boolean => {
    return !!(project.excludedCostComponents?.[`${catId}-${compId}`]);
  };

  const toggleCostComponentIncluded = (catId: string, compId: string) => {
    const currentExcluded = project.excludedCostComponents || {};
    const key = `${catId}-${compId}`;
    const updatedExcluded = {
      ...currentExcluded,
      [key]: !currentExcluded[key]
    };

    const updatedProjects = projects.map((p) => {
      if (p.id === project.id) {
        return {
          ...p,
          excludedCostComponents: updatedExcluded
        };
      }
      return p;
    });
    setProjects(updatedProjects);
    setIsUnsavedCloud(true);
  };

  // Helper to calculate cost breakdown for a category / vendor
  const getCategoryTotalBreakdown = (catId: string, venId: string) => {
    const category = project.categories.find(c => c.id === catId);
    if (!category) return { oneTime: 0, recurring: 0 };
    
    // If category has its own vendor list and venId is not in it, return 0
    if (category.vendors && !category.vendors.some(v => v.id === venId)) {
      return { oneTime: 0, recurring: 0 };
    }
    
    let oneTime = 0;
    let recurring = 0;
    
    category.components.forEach(comp => {
      if (isComponentExcluded(catId, comp.id)) return;
      const val = project.costValues[catId]?.[comp.id]?.[venId] || 0;
      const factor = getComponentScaleFactor(comp.name, comp.id, tcoYears, category.components);
      
      const isAnnual = comp.name.toLowerCase().includes("annual") || 
                        comp.name.toLowerCase().includes("recurring") || 
                        comp.name.toLowerCase().includes("yearly") || 
                        comp.name.toLowerCase().includes("subscription") ||
                        comp.name.toLowerCase().includes("per year") ||
                        comp.id.toLowerCase().includes("annual") ||
                        comp.id.toLowerCase().includes("recurring") ||
                        comp.id.toLowerCase().includes("subscription");

      if (isAnnual || factor > 1) {
        recurring += val * factor;
      } else {
        oneTime += val * factor;
      }
    });
    
    return { oneTime, recurring };
  };

  // Helper to calculate cost breakdown globally for a vendor
  const getVendorGrandTotalBreakdown = (venId: string) => {
    let oneTime = 0;
    let recurring = 0;
    project.categories.forEach(cat => {
      const b = getCategoryTotalBreakdown(cat.id, venId);
      oneTime += b.oneTime;
      recurring += b.recurring;
    });
    return { oneTime, recurring };
  };

  const getCategoryTotalForVendor = (catId: string, venId: string): number => {
    const b = getCategoryTotalBreakdown(catId, venId);
    return b.oneTime + b.recurring;
  };

  const getVendorGrandTotal = (venId: string): number => {
    const b = getVendorGrandTotalBreakdown(venId);
    return b.oneTime + b.recurring;
  };

  // Helper to calculate cost breakdown for selected categories for a vendor
  const getVendorSelectedGrandTotalBreakdown = (venId: string) => {
    let oneTime = 0;
    let recurring = 0;
    project.categories.forEach(cat => {
      const isSelected = project.selectedVendorIds?.[cat.id] === venId;
      if (isSelected) {
        const b = getCategoryTotalBreakdown(cat.id, venId);
        oneTime += b.oneTime;
        recurring += b.recurring;
      }
    });
    return { oneTime, recurring };
  };

  const getVendorSelectedGrandTotal = (venId: string): number => {
    const b = getVendorSelectedGrandTotalBreakdown(venId);
    return b.oneTime + b.recurring;
  };

  // Helper to calculate total cost breakdown of selected vendor options across all categories
  const getSelectedOptionsGrandTotalBreakdown = () => {
    let oneTime = 0;
    let recurring = 0;
    project.categories.forEach(cat => {
      const selVendorId = project.selectedVendorIds?.[cat.id];
      if (selVendorId) {
        const b = getCategoryTotalBreakdown(cat.id, selVendorId);
        oneTime += b.oneTime;
        recurring += b.recurring;
      }
    });
    return { oneTime, recurring };
  };

  // Find cheapest vendor based on financial GRAND TOTAL TCO
  const getFinancialBriefing = () => {
    const totals = project.vendors.map(v => ({
      id: v.id,
      name: v.name,
      total: getVendorGrandTotal(v.id)
    }));

    // Filter out vendors with 0 total cost to avoid flagging unpriced vendors as cheapest
    const pricedVendors = totals.filter(t => t.total > 0);
    if (pricedVendors.length === 0) return null;

    const sorted = [...pricedVendors].sort((a, b) => a.total - b.total);
    const cheapest = sorted[0];
    const mostExpensive = sorted[sorted.length - 1];
    
    // Calculate potential savings (compared to average or next cheapest)
    let comparisonText = "";
    let savingsAmount = 0;
    if (sorted.length > 1) {
      const runnerUp = sorted[1];
      savingsAmount = runnerUp.total - cheapest.total;
      const percentage = runnerUp.total > 0 ? ((savingsAmount / runnerUp.total) * 100).toFixed(1) : "0";
      comparisonText = `saving ${percentage}% (${formatCurrency(savingsAmount)}) compared to ${runnerUp.name}`;
    } else {
      comparisonText = "is currently the only quoted vendor.";
    }

    return {
      cheapest,
      mostExpensive,
      savingsAmount,
      comparisonText,
      totalPriced: pricedVendors.length
    };
  };

  const briefing = getFinancialBriefing();

  const cheapestVendor = [...project.vendors]
    .map(v => ({ id: v.id, name: v.name, total: getVendorGrandTotal(v.id) }))
    .filter(x => x.total > 0)
    .sort((a, b) => a.total - b.total)[0] || null;

  const highestRatedVendor = [...project.vendors]
    .map(v => ({ id: v.id, name: v.name, score: getVendorScorecardAvg(v.id) }))
    .sort((a, b) => b.score - a.score)[0] || null;

  const bestValueVendor = [...project.vendors]
    .map(v => {
      const total = getVendorGrandTotal(v.id);
      const score = getVendorScorecardAvg(v.id);
      const index = total > 0 ? (score * 100000) / total : 0;
      return { id: v.id, name: v.name, index, total, score };
    })
    .filter(x => x.total > 0)
    .sort((a, b) => b.index - a.index)[0] || null;

  const activeTotalsList = project.vendors.map(v => getVendorGrandTotal(v.id)).filter(t => t > 0);
  const avgProjectCost = activeTotalsList.length > 0 ? activeTotalsList.reduce((a, b) => a + b, 0) / activeTotalsList.length : 0;

  // Helper to get vendors for a specific category or default to global vendors
  const getCategoryVendors = (cat: Category): Vendor[] => {
    return cat.vendors || project.vendors;
  };

  // Select Vendor Handler
  const handleSelectVendor = (catId: string, vendorId: string) => {
    const updated = { ...project };
    if (!updated.selectedVendorIds) {
      updated.selectedVendorIds = {};
    }
    
    if (!vendorId || updated.selectedVendorIds[catId] === vendorId) {
      delete updated.selectedVendorIds[catId];
      showToast("Vendor selection cleared for this category");
    } else {
      updated.selectedVendorIds[catId] = vendorId;
      const cat = project.categories.find(c => c.id === catId);
      const vendorsList = cat ? getCategoryVendors(cat) : project.vendors;
      const vendorName = vendorsList.find(v => v.id === vendorId)?.name || "Vendor";
      showToast(`Selected "${vendorName}" for category "${cat?.name || "Category"}"`);
    }
    updateCurrentProject(updated);
  };

  // Field Edit Handlers
  const startEditing = (type: typeof editingField.type, id?: string, subId?: string, currentVal: string = "", catId?: string) => {
    setEditingField({ type, id, subId, catId });
    setEditValue(currentVal);
  };

  const saveInlineEdit = () => {
    if (!editingField.type) return;

    const updated = { ...project };

    if (editingField.type === "project-name") {
      updated.name = editValue.trim() || "Untitled Comparison";
      updateCurrentProject(updated);
      showToast("Comparison project renamed");
    } else if (editingField.type === "project-date") {
      updated.date = editValue.trim() || new Date().toISOString().split('T')[0];
      updateCurrentProject(updated);
      showToast("Date updated");
    } else if (editingField.type === "project-version") {
      updated.version = editValue.trim() || "v1.0";
      updateCurrentProject(updated);
    } else if (editingField.type === "vendor-name" && editingField.id) {
      const vId = editingField.id;
      const newName = editValue.trim() || "Vendor";
      const catId = editingField.catId;

      if (catId) {
        // Group-specific vendor name edit
        updated.categories = updated.categories.map(c => {
          if (c.id === catId) {
            const currentVendors = c.vendors || JSON.parse(JSON.stringify(project.vendors));
            return {
              ...c,
              vendors: currentVendors.map((v: Vendor) => v.id === vId ? { ...v, name: newName } : v)
            };
          }
          return c;
        });
        showToast(`Vendor renamed to "${newName}" in this group`);
      } else {
        // Global vendor name edit
        updated.vendors = updated.vendors.map(v => v.id === vId ? { ...v, name: newName } : v);
        updated.categories = updated.categories.map(c => {
          if (c.vendors) {
            return {
              ...c,
              vendors: c.vendors.map(v => v.id === vId ? { ...v, name: newName } : v)
            };
          }
          return c;
        });
        showToast(`Vendor renamed globally to "${newName}"`);
      }
      updateCurrentProject(updated);
    } else if (editingField.type === "category-name" && editingField.id) {
      const catId = editingField.id;
      const newName = editValue.trim() || "Category Name";
      updated.categories = updated.categories.map(c => c.id === catId ? { ...c, name: newName } : c);
      updateCurrentProject(updated);
      showToast(`Category renamed to "${newName}"`);
    } else if (editingField.type === "component-name" && editingField.id && editingField.subId) {
      const catId = editingField.id;
      const compId = editingField.subId;
      const newName = editValue.trim() || "Cost Component";
      updated.categories = updated.categories.map(c => {
        if (c.id === catId) {
          return {
            ...c,
            components: c.components.map(comp => comp.id === compId ? { ...comp, name: newName } : comp)
          };
        }
        return c;
      });
      updateCurrentProject(updated);
    } else if (editingField.type === "criteria-name" && editingField.id) {
      const critId = editingField.id;
      const newName = editValue.trim() || "Evaluation Criteria";
      const currentCriteria = project.criteria || [
        { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
        { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
        { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
        { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
      ];
      updated.criteria = currentCriteria.map(c => c.id === critId ? { ...c, name: newName } : c);
      updateCurrentProject(updated);
      showToast(`Criteria renamed to "${newName}"`);
    } else if (editingField.type === "criteria-desc" && editingField.id) {
      const critId = editingField.id;
      const newDesc = editValue.trim() || "";
      const currentCriteria = project.criteria || [
        { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
        { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
        { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
        { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
      ];
      updated.criteria = currentCriteria.map(c => c.id === critId ? { ...c, description: newDesc } : c);
      updateCurrentProject(updated);
    }

    setEditingField({ type: null });
  };

  // Add Evaluation Criteria
  const addCriteria = () => {
    const updated = { ...project };
    const currentCriteria = updated.criteria || [
      { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
      { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
      { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
      { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
    ];
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newId = `crit-${randomHex}`;
    const newName = "New Evaluation Criteria";
    const newDesc = "Define the qualitative metric description...";

    updated.criteria = [...currentCriteria, { id: newId, name: newName, description: newDesc }];

    // Set fallback rating (3 stars) for all vendors under this new criteria
    setScorecards(prev => {
      const projId = project.id;
      const currentProj = prev[projId] || {};
      const nextProj = { ...currentProj };
      project.vendors.forEach(v => {
        nextProj[v.id] = {
          ...(nextProj[v.id] || {}),
          [newId]: 3
        };
      });
      return {
        ...prev,
        [projId]: nextProj
      };
    });

    updateCurrentProject(updated);
    showToast("Added scorecard criteria line!");

    setTimeout(() => {
      startEditing("criteria-name", newId, undefined, newName);
    }, 100);
  };

  // Remove Evaluation Criteria
  const deleteCriteria = (critId: string, critName: string) => {
    const updated = { ...project };
    const currentCriteria = updated.criteria || [
      { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
      { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
      { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
      { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
    ];
    if (currentCriteria.length <= 1) {
      showToast("Cannot delete the last remaining scorecard criteria.", "error");
      return;
    }

    setConfirmDialog({
      title: "Remove Criteria",
      message: `Are you sure you want to remove criteria "${critName}"?`,
      onConfirm: () => {
        updated.criteria = currentCriteria.filter(c => c.id !== critId);

        // Prune ratings
        setScorecards(prev => {
          const projId = project.id;
          const currentProj = prev[projId] || {};
          const nextProj = { ...currentProj };
          Object.keys(nextProj).forEach(vId => {
            if (nextProj[vId]) {
              const nextScores = { ...nextProj[vId] };
              delete nextScores[critId];
              nextProj[vId] = nextScores;
            }
          });
          return {
            ...prev,
            [projId]: nextProj
          };
        });

        updateCurrentProject(updated);
        showToast(`Removed criteria "${critName}"`);
      }
    });
  };

  const handleCellChange = (catId: string, compId: string, venId: string, valueStr: string) => {
    const numericVal = parseFloat(valueStr.replace(/[^0-9.-]/g, "")) || 0;
    
    // Immutable nesting update to ensure correct React re-renders and auto-calculations
    const updatedCostValues = {
      ...project.costValues,
      [catId]: {
        ...project.costValues[catId],
        [compId]: {
          ...(project.costValues[catId]?.[compId] || {}),
          [venId]: numericVal
        }
      }
    };
    
    const updated: QuoteProject = {
      ...project,
      costValues: updatedCostValues
    };
    updateCurrentProject(updated);
  };

  const handleRatingChange = (venId: string, criteria: string, rating: number) => {
    const projId = project.id;
    setScorecards(prev => {
      const currentProj = prev[projId] || {};
      const currentVendor = currentProj[venId] || { technical: 0, support: 0, ease: 0, value: 0 };
      
      return {
        ...prev,
        [projId]: {
          ...currentProj,
          [venId]: {
            ...currentVendor,
            [criteria]: rating
          }
        }
      };
    });
  };

  const handleCategoryCommentChange = (catId: string, comment: string) => {
    const updated = { ...project };
    if (!updated.comments) updated.comments = {};
    updated.comments[catId] = comment;
    updateCurrentProject(updated);
  };

  const handleVendorNotesChange = (venId: string, notes: string) => {
    const updatedVendorNotes = {
      ...project.vendorNotes,
      [venId]: notes
    };
    const updated: QuoteProject = {
      ...project,
      vendorNotes: updatedVendorNotes
    };
    updateCurrentProject(updated);
  };

  const handleGeneralNotesChange = (text: string) => {
    const updated: QuoteProject = {
      ...project,
      generalNotes: text
    };
    updateCurrentProject(updated);
  };

  const handleVendorPlanChange = (vId: string, val: string) => {
    const updated: QuoteProject = {
      ...project,
      vendorPlans: {
        ...(project.vendorPlans || {}),
        [vId]: val
      }
    };
    updateCurrentProject(updated);
  };

  const handlePaymentMilestonesChange = (vId: string, val: string) => {
    const updated: QuoteProject = {
      ...project,
      paymentMilestones: {
        ...(project.paymentMilestones || {}),
        [vId]: val
      }
    };
    updateCurrentProject(updated);
  };

  const handleOnboardingTimelineChange = (vId: string, val: string) => {
    const updated: QuoteProject = {
      ...project,
      onboardingTimelines: {
        ...(project.onboardingTimelines || {}),
        [vId]: val
      }
    };
    updateCurrentProject(updated);
  };

  const getCategoryQualitativeRows = (p: QuoteProject, catId: string): QualitativeRow[] => {
    if (p.categoryQualitativeRows?.[catId] && p.categoryQualitativeRows[catId].length > 0) {
      return p.categoryQualitativeRows[catId];
    }
    const category = p.categories.find(c => c.id === catId);
    const vens = category?.vendors || p.vendors || [];
    const defaultRows: QualitativeRow[] = [
      {
        id: `plan-model-${catId}`,
        name: "Plan / Model Description",
        description: "Software tier details, seat allotments, licenses, or specific server models.",
        values: vens.reduce((acc, v) => {
          acc[v.id] = "";
          return acc;
        }, {} as Record<string, string>)
      },
      {
        id: `payment-milestones-${catId}`,
        name: "Payment Milestones",
        description: "Incremental payout milestones (e.g., 30% advance, progress payments, or final acceptance).",
        values: vens.reduce((acc, v) => {
          acc[v.id] = "";
          return acc;
        }, {} as Record<string, string>)
      },
      {
        id: `onboarding-timeline-${catId}`,
        name: "Onboarding Timeline",
        description: "Estimated system setup, cloud migration, key training schedules.",
        values: vens.reduce((acc, v) => {
          acc[v.id] = "";
          return acc;
        }, {} as Record<string, string>)
      }
    ];
    return defaultRows;
  };

  const handleCategoryQualitativeRowHeaderChange = (catId: string, rowId: string, field: "name" | "description", val: string) => {
    const currentRows = getCategoryQualitativeRows(project, catId);
    const updatedRows = currentRows.map(row => {
      if (row.id === rowId) {
        return { ...row, [field]: val };
      }
      return row;
    });
    const updatedCategoryQualitativeRows = {
      ...(project.categoryQualitativeRows || {}),
      [catId]: updatedRows
    };
    updateCurrentProject({ ...project, categoryQualitativeRows: updatedCategoryQualitativeRows });
  };

  const handleCategoryQualitativeRowValueChange = (catId: string, rowId: string, vendorId: string, val: string) => {
    const currentRows = getCategoryQualitativeRows(project, catId);
    const updatedRows = currentRows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          values: {
            ...(row.values || {}),
            [vendorId]: val
          }
        };
      }
      return row;
    });
    const updatedCategoryQualitativeRows = {
      ...(project.categoryQualitativeRows || {}),
      [catId]: updatedRows
    };
    updateCurrentProject({ ...project, categoryQualitativeRows: updatedCategoryQualitativeRows });
  };

  const cloneCategoryQualitativeRow = (catId: string, rowId: string) => {
    const currentRows = getCategoryQualitativeRows(project, catId);
    const targetRow = currentRows.find(r => r.id === rowId);
    if (!targetRow) return;

    const randomHex = Math.random().toString(36).substring(2, 7);
    const clonedRow: QualitativeRow = {
      id: `qual-${catId}-${randomHex}`,
      name: `${targetRow.name} (Clone)`,
      description: targetRow.description,
      values: JSON.parse(JSON.stringify(targetRow.values || {}))
    };

    const updatedCategoryQualitativeRows = {
      ...(project.categoryQualitativeRows || {}),
      [catId]: [...currentRows, clonedRow]
    };

    updateCurrentProject({ ...project, categoryQualitativeRows: updatedCategoryQualitativeRows });
    showToast(`Cloned category parameter "${targetRow.name}"`);
  };

  const deleteCategoryQualitativeRow = (catId: string, rowId: string) => {
    const currentRows = getCategoryQualitativeRows(project, catId);
    const targetRow = currentRows.find(r => r.id === rowId);
    if (!targetRow) return;

    setConfirmDialog({
      title: "Delete Category Parameter",
      message: `Are you sure you want to delete "${targetRow.name || "this parameter"}" for this category? All suppliers' descriptions for this parameter will be deleted.`,
      onConfirm: () => {
        const remaining = currentRows.filter(r => r.id !== rowId);
        const updatedCategoryQualitativeRows = {
          ...(project.categoryQualitativeRows || {}),
          [catId]: remaining
        };
        updateCurrentProject({ ...project, categoryQualitativeRows: updatedCategoryQualitativeRows });
        showToast(`Deleted qualitative parameter "${targetRow.name}"`);
      }
    });
  };

  const addCategoryQualitativeRow = (catId: string) => {
    const currentRows = getCategoryQualitativeRows(project, catId);
    const randomHex = Math.random().toString(36).substring(2, 7);
    const category = project.categories.find(c => c.id === catId);
    const targetVendors = category?.vendors || project.vendors || [];
    const newRow: QualitativeRow = {
      id: `qual-${catId}-${randomHex}`,
      name: `New Parameter ${currentRows.length + 1}`,
      description: "Description of the criteria / milestone terms.",
      values: targetVendors.reduce((acc, v) => {
        acc[v.id] = "";
        return acc;
      }, {} as Record<string, string>)
    };

    const updatedCategoryQualitativeRows = {
      ...(project.categoryQualitativeRows || {}),
      [catId]: [...currentRows, newRow]
    };

    updateCurrentProject({ ...project, categoryQualitativeRows: updatedCategoryQualitativeRows });
    showToast("Added new qualitative parameter row for this category!");
  };

  const getProjectQualitativeRows = (p: QuoteProject): QualitativeRow[] => {
    if (p.qualitativeRows && p.qualitativeRows.length > 0) {
      return p.qualitativeRows;
    }
    const vens = p.vendors || [];
    const defaultRows: QualitativeRow[] = [
      {
        id: "plan-model",
        name: "Plan / Model Description",
        description: "Software tier details, seat allotments, licenses, or specific server models.",
        values: vens.reduce((acc, v) => {
          acc[v.id] = p.vendorPlans?.[v.id] || "";
          return acc;
        }, {} as Record<string, string>)
      },
      {
        id: "payment-milestones",
        name: "Payment Milestones",
        description: "Incremental payout milestones (e.g., 30% advance, progress payments, or final acceptance).",
        values: vens.reduce((acc, v) => {
          acc[v.id] = p.paymentMilestones?.[v.id] || "";
          return acc;
        }, {} as Record<string, string>)
      },
      {
        id: "onboarding-timeline",
        name: "Onboarding Timeline",
        description: "Estimated system setup, cloud migration, key training schedules.",
        values: vens.reduce((acc, v) => {
          acc[v.id] = p.onboardingTimelines?.[v.id] || "";
          return acc;
        }, {} as Record<string, string>)
      }
    ];
    return defaultRows;
  };

  const handleQualitativeRowHeaderChange = (rowId: string, field: "name" | "description", val: string) => {
    const currentRows = getProjectQualitativeRows(project);
    const updatedRows = currentRows.map(row => {
      if (row.id === rowId) {
        return { ...row, [field]: val };
      }
      return row;
    });
    updateCurrentProject({ ...project, qualitativeRows: updatedRows });
  };

  const handleQualitativeRowValueChange = (rowId: string, vendorId: string, val: string) => {
    const currentRows = getProjectQualitativeRows(project);
    const updatedRows = currentRows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          values: {
            ...(row.values || {}),
            [vendorId]: val
          }
        };
      }
      return row;
    });
    updateCurrentProject({ ...project, qualitativeRows: updatedRows });
  };

  const cloneQualitativeRow = (rowId: string) => {
    const currentRows = getProjectQualitativeRows(project);
    const targetRow = currentRows.find(r => r.id === rowId);
    if (!targetRow) return;

    const randomHex = Math.random().toString(36).substring(2, 7);
    const clonedRow: QualitativeRow = {
      id: `qual-${randomHex}`,
      name: `${targetRow.name} (Clone)`,
      description: targetRow.description,
      values: JSON.parse(JSON.stringify(targetRow.values || {}))
    };

    updateCurrentProject({ ...project, qualitativeRows: [...currentRows, clonedRow] });
    showToast(`Cloned qualitative parameter "${targetRow.name}"`);
  };

  const deleteQualitativeRow = (rowId: string) => {
    const currentRows = getProjectQualitativeRows(project);
    const targetRow = currentRows.find(r => r.id === rowId);
    if (!targetRow) return;

    setConfirmDialog({
      title: "Delete Qualitative Parameter",
      message: `Are you sure you want to delete "${targetRow.name || "this parameter"}"? All suppliers' descriptions for this parameter will be deleted.`,
      onConfirm: () => {
        const remaining = currentRows.filter(r => r.id !== rowId);
        updateCurrentProject({ ...project, qualitativeRows: remaining });
        showToast(`Deleted qualitative parameter "${targetRow.name}"`);
      }
    });
  };

  const addQualitativeRow = () => {
    const currentRows = getProjectQualitativeRows(project);
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newRow: QualitativeRow = {
      id: `qual-${randomHex}`,
      name: `New Parameter ${currentRows.length + 1}`,
      description: "Description of the criteria / milestone terms.",
      values: project.vendors.reduce((acc, v) => {
        acc[v.id] = "";
        return acc;
      }, {} as Record<string, string>)
    };

    updateCurrentProject({ ...project, qualitativeRows: [...currentRows, newRow] });
    showToast("Added new qualitative parameter row!");
  };

  const recommendVendor = (vId: string) => {
    const updated: QuoteProject = {
      ...project,
      recommendedVendorId: vId
    };
    updateCurrentProject(updated);
  };

  // Add Vendor Column
  const addNewVendor = (catId?: string) => {
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newId = `vendor-${randomHex}`;
    
    let targetVendors = project.vendors;
    if (catId) {
      const cat = project.categories.find(c => c.id === catId);
      if (cat) {
        targetVendors = cat.vendors || project.vendors;
      }
    }
    
    const newName = `New Vendor ${String.fromCharCode(65 + targetVendors.length)}`;
    const newVendor = { id: newId, name: newName };
    
    const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));
    
    project.categories.forEach(cat => {
      if (!catId || cat.id === catId) {
        if (!updatedCostValues[cat.id]) updatedCostValues[cat.id] = {};
        cat.components.forEach(comp => {
          if (!updatedCostValues[cat.id][comp.id]) updatedCostValues[cat.id][comp.id] = {};
          updatedCostValues[cat.id][comp.id][newId] = 0;
        });
      }
    });

    let updated: QuoteProject;
    if (catId) {
      const updatedCategories = project.categories.map(c => {
        if (c.id === catId) {
          const currentVendors = c.vendors || project.vendors;
          return {
            ...c,
            vendors: [...currentVendors, newVendor]
          };
        }
        return c;
      });
      updated = {
        ...project,
        categories: updatedCategories,
        costValues: updatedCostValues,
      };
    } else {
      const updatedVendors = [...project.vendors, newVendor];
      updated = {
        ...project,
        vendors: updatedVendors,
        costValues: updatedCostValues,
      };
    }

    // Initialize qualitative scorecard
    setScorecards(prev => {
      const currentProj = prev[project.id] || {};
      return {
        ...prev,
        [project.id]: {
          ...currentProj,
          [newId]: { technical: 3, support: 3, ease: 3, value: 3 }
        }
      };
    });

    updateCurrentProject(updated);
    showToast(`Added ${newName} to the table.`);
    // Auto edit vendor name
    setTimeout(() => {
      startEditing("vendor-name", newId, undefined, newName);
    }, 100);
  };

  // Delete Vendor Column
  const deleteVendor = (venId: string, venName: string, catId?: string) => {
    let activeVendors = project.vendors;
    if (catId) {
      const cat = project.categories.find(c => c.id === catId);
      if (cat) {
        activeVendors = cat.vendors || project.vendors;
      }
    }

    if (activeVendors.length <= 1) {
      showToast("Cannot delete the last remaining vendor column in this table.", "error");
      return;
    }

    setConfirmDialog({
      title: "Delete Vendor Column",
      message: `Are you sure you want to delete vendor "${venName}" and all associated cost entries for this table?`,
      onConfirm: () => {
        const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));

        let updated: QuoteProject;
        if (catId) {
          const updatedCategories = project.categories.map(c => {
            if (c.id === catId) {
              const currentVendors = c.vendors || project.vendors;
              return {
                ...c,
                vendors: currentVendors.filter(v => v.id !== venId)
              };
            }
            return c;
          });

          if (updatedCostValues[catId]) {
            Object.keys(updatedCostValues[catId]).forEach(compId => {
              if (updatedCostValues[catId][compId]) {
                delete updatedCostValues[catId][compId][venId];
              }
            });
          }

          updated = {
            ...project,
            categories: updatedCategories,
            costValues: updatedCostValues
          };
        } else {
          const updatedVendors = project.vendors.filter(v => v.id !== venId);
          Object.keys(updatedCostValues).forEach(cId => {
            Object.keys(updatedCostValues[cId]).forEach(compId => {
              if (updatedCostValues[cId][compId]) {
                delete updatedCostValues[cId][compId][venId];
              }
            });
          });

          updated = {
            ...project,
            vendors: updatedVendors,
            costValues: updatedCostValues
          };
        }

        updateCurrentProject(updated);
        showToast(`Deleted vendor "${venName}"`);
      }
    });
  };

  // Add Cost Category Table
  const addNewCategory = () => {
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newCatId = `category-${randomHex}`;
    const newCatName = `Custom Category ${project.categories.length + 1}`;

    const duration = project.tcoYears || 3;
    const comps = [
      { id: "setup-cost", name: "Setup Cost" },
      { id: "one-time-integration", name: "One-time Integration" }
    ];
    for (let i = 1; i <= duration; i++) {
      comps.push({ id: `annual-fee-year-${i}`, name: `Annual Fee — Year ${i}` });
    }

    const newCategory: Category = {
      id: newCatId,
      name: newCatName,
      components: comps
    };

    const updatedCategories = [...project.categories, newCategory];
    const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));

    // Initialize values mapping with 0s
    updatedCostValues[newCatId] = {};
    comps.forEach(comp => {
      updatedCostValues[newCatId][comp.id] = {};
      project.vendors.forEach(v => {
        updatedCostValues[newCatId][comp.id][v.id] = 0;
      });
    });

    const updatedComments = { ...project.comments, [newCatId]: "" };

    const updated: QuoteProject = {
      ...project,
      categories: updatedCategories,
      costValues: updatedCostValues,
      comments: updatedComments
    };

    updateCurrentProject(updated);
    showToast(`Created category "${newCatName}" with default cost components.`);
    
    // Scroll to the newly added category
    setTimeout(() => {
      const el = document.getElementById(newCatId);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 150);
  };

  // Delete Category
  const deleteCategory = (catId: string, catName: string) => {
    if (project.categories.length <= 1) {
      showToast("Cannot delete the last remaining cost category.", "error");
      return;
    }

    setConfirmDialog({
      title: "Delete Cost Category",
      message: `Are you sure you want to delete category "${catName}" and all of its row entries?`,
      onConfirm: () => {
        const updatedCategories = project.categories.filter(c => c.id !== catId);
        const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));
        delete updatedCostValues[catId];
        
        const updatedComments = { ...project.comments };
        delete updatedComments[catId];

        const updated: QuoteProject = {
          ...project,
          categories: updatedCategories,
          costValues: updatedCostValues,
          comments: updatedComments
        };

        updateCurrentProject(updated);
        showToast(`Deleted category "${catName}"`);
      }
    });
  };

  // Add Cost Row (Component) to Category
  const addCostComponent = (catId: string) => {
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newCompId = `component-${randomHex}`;
    const newCompName = "New Cost Component";

    const updatedCategories = project.categories.map(c => {
      if (c.id === catId) {
        return {
          ...c,
          components: [...c.components, { id: newCompId, name: newCompName }]
        };
      }
      return c;
    });

    const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));
    if (!updatedCostValues[catId]) updatedCostValues[catId] = {};
    updatedCostValues[catId][newCompId] = {};
    project.vendors.forEach(v => {
      updatedCostValues[catId][newCompId][v.id] = 0;
    });

    const updated: QuoteProject = {
      ...project,
      categories: updatedCategories,
      costValues: updatedCostValues
    };

    updateCurrentProject(updated);
    showToast("Added new entry row. Type component details directly.");

    setTimeout(() => {
      startEditing("component-name", catId, newCompId, newCompName);
    }, 100);
  };

  // Delete Cost Component Row
  const deleteCostComponent = (catId: string, compId: string, compName: string) => {
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return;

    if (cat.components.length <= 1) {
      showToast("Cannot empty all cost components. Please delete the entire category instead.", "error");
      return;
    }

    const updatedCategories = project.categories.map(c => {
      if (c.id === catId) {
        return {
          ...c,
          components: c.components.filter(comp => comp.id !== compId)
        };
      }
      return c;
    });

    const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));
    if (updatedCostValues[catId] && updatedCostValues[catId][compId]) {
      delete updatedCostValues[catId][compId];
    }

    const updated: QuoteProject = {
      ...project,
      categories: updatedCategories,
      costValues: updatedCostValues
    };

    updateCurrentProject(updated);
    showToast(`Deleted component row "${compName}"`);
  };

  // Clone Cost Component Row (Clone annual repeat, incrementing years)
  const cloneCostComponent = (catId: string, compId: string, compName: string) => {
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return;

    const originalComp = cat.components.find(comp => comp.id === compId);
    if (!originalComp) return;

    const randomHex = Math.random().toString(36).substring(2, 7);
    const newCompId = `component-${randomHex}`;
    
    let newCompName = `${originalComp.name} (Clone)`;
    const matchYear = originalComp.name.match(/Year\s*(\d+)/i) || originalComp.name.match(/Yr\s*(\d+)/i);
    if (matchYear) {
      const year = parseInt(matchYear[1], 10);
      newCompName = originalComp.name.replace(/Year\s*\d+/i, `Year ${year + 1}`).replace(/Yr\s*\d+/i, `Yr ${year + 1}`);
    }

    // Add component to category immediately after original
    const updatedCategories = project.categories.map(c => {
      if (c.id === catId) {
        const idx = c.components.findIndex(comp => comp.id === compId);
        const newComponents = [...c.components];
        newComponents.splice(idx + 1, 0, { id: newCompId, name: newCompName });
        return {
          ...c,
          components: newComponents
        };
      }
      return c;
    });

    const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));
    if (!updatedCostValues[catId]) updatedCostValues[catId] = {};
    updatedCostValues[catId][newCompId] = {};
    project.vendors.forEach(v => {
      const parentVal = project.costValues[catId]?.[compId]?.[v.id] ?? 0;
      updatedCostValues[catId][newCompId][v.id] = parentVal;
    });

    // Clone monthly cost trackers if any exist
    const monthlyCostTrackers = JSON.parse(JSON.stringify(project.monthlyCostTrackers || {}));
    project.vendors.forEach(v => {
      const sourceTracker = project.monthlyCostTrackers?.[catId]?.[compId]?.[v.id];
      if (sourceTracker) {
        if (!monthlyCostTrackers[catId]) monthlyCostTrackers[catId] = {};
        if (!monthlyCostTrackers[catId][newCompId]) monthlyCostTrackers[catId][newCompId] = {};
        monthlyCostTrackers[catId][newCompId][v.id] = sourceTracker.map((row: any) => ({
          ...row,
          id: `row-${Math.random().toString(36).substring(2, 7)}`
        }));
      }
    });

    const updated: QuoteProject = {
      ...project,
      categories: updatedCategories,
      costValues: updatedCostValues,
      monthlyCostTrackers
    };

    updateCurrentProject(updated);
    showToast(`Cloned "${compName}" into "${newCompName}"`);
    
    setTimeout(() => {
      startEditing("component-name", catId, newCompId, newCompName);
    }, 100);
  };

  const toggleTrackerExpanded = (catId: string, compId: string) => {
    setExpandedTrackers(prev => {
      const catPrev = prev[catId] || {};
      return {
        ...prev,
        [catId]: {
          ...catPrev,
          [compId]: !catPrev[compId]
        }
      };
    });
  };

  const handleVendorTrackerToggle = (catId: string, compId: string, vendorId: string) => {
    const isCurrentlyExpanded = expandedTrackers[catId]?.[compId];
    const currentSelectedVendor = trackerVendorSelections[`${catId}-${compId}`] || project.vendors[0]?.id || "";
    
    if (isCurrentlyExpanded && currentSelectedVendor === vendorId) {
      toggleTrackerExpanded(catId, compId);
    } else {
      if (!isCurrentlyExpanded) {
        toggleTrackerExpanded(catId, compId);
      }
      setTrackerVendorSelections(prev => ({
        ...prev,
        [`${catId}-${compId}`]: vendorId
      }));
    }
  };

  const getMonthlyTrackerRows = (catId: string, compId: string, vendorId: string): MonthlyCostTrackerRow[] => {
    if (project.monthlyCostTrackers?.[catId]?.[compId]?.[vendorId]) {
      return project.monthlyCostTrackers[catId][compId][vendorId];
    }
    
    // Return default categories based on the PDF screenshot
    const defaultCategories = [
      "Hardware",
      "Software Licenses",
      "Cloud Services",
      "Consultancy",
      "Manpower",
      "Training",
      "Travel & Accommodation",
      "Miscellaneous",
      "Contingency"
    ];
    
    return defaultCategories.map((name, index) => ({
      id: `row-${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${index}`,
      category: name,
      annualBudget: 0,
      months: Array(12).fill(0),
      description: "",
      excluded: false
    }));
  };

  const updateMonthlyTracker = (
    catId: string,
    compId: string,
    vendorId: string,
    updatedRows: MonthlyCostTrackerRow[]
  ) => {
    const syncedRows = updatedRows.map(row => {
      const monthSum = row.months.reduce((a, b) => a + b, 0);
      if (monthSum > 0) {
        return {
          ...row,
          annualBudget: monthSum
        };
      }
      return row;
    });

    const updatedTrackers = JSON.parse(JSON.stringify(project.monthlyCostTrackers || {}));
    if (!updatedTrackers[catId]) updatedTrackers[catId] = {};
    if (!updatedTrackers[catId][compId]) updatedTrackers[catId][compId] = {};
    updatedTrackers[catId][compId][vendorId] = syncedRows;

    const activeRowsSum = syncedRows
      .filter(row => !row.excluded)
      .reduce((sum, row) => sum + row.annualBudget, 0);

    const updatedCostValues = JSON.parse(JSON.stringify(project.costValues));
    if (!updatedCostValues[catId]) updatedCostValues[catId] = {};
    if (!updatedCostValues[catId][compId]) updatedCostValues[catId][compId] = {};
    updatedCostValues[catId][compId][vendorId] = activeRowsSum;

    const updated: QuoteProject = {
      ...project,
      monthlyCostTrackers: updatedTrackers,
      costValues: updatedCostValues
    };

    updateCurrentProject(updated);
  };

  // Controlled input component for month-wise amounts that updates parent only on Enter or Blur
  function MonthAmountInput({ 
    value, 
    onSave,
    disabled
  }: { 
    value: number; 
    onSave: (val: number) => void;
    disabled?: boolean;
  }) {
    const [localVal, setLocalVal] = useState(value === 0 ? "0" : value.toString());

    useEffect(() => {
      setLocalVal(value === 0 ? "0" : value.toString());
    }, [value]);

    const commitValue = () => {
      const cleanStr = localVal.replace(/[^0-9.-]/g, "");
      const parsed = parseFloat(cleanStr);
      const finalVal = isNaN(parsed) ? 0 : parsed;
      onSave(finalVal);
      setLocalVal(finalVal === 0 ? "0" : finalVal.toString());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitValue();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setLocalVal(value === 0 ? "0" : value.toString());
        e.currentTarget.blur();
      }
    };

    return (
      <input
        type="text"
        disabled={disabled}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        className={`text-right w-11 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-cyan-500 py-0.5 px-0.5 text-[11px] font-bold transition rounded focus:bg-cyan-50/30 ${
          disabled ? "text-slate-350 line-through cursor-not-allowed" : "text-slate-700 focus:text-slate-900"
        }`}
      />
    );
  }

  // Controlled input component for tracker row Annual Budget that updates parent on Enter or Blur
  function TrackerAnnualBudgetInput({ 
    value, 
    onSave,
    disabled
  }: { 
    value: number; 
    onSave: (val: number) => void;
    disabled?: boolean;
  }) {
    const [localVal, setLocalVal] = useState(value === 0 ? "0" : value.toString());

    useEffect(() => {
      setLocalVal(value === 0 ? "0" : value.toString());
    }, [value]);

    const commitValue = () => {
      const cleanStr = localVal.replace(/[^0-9.-]/g, "");
      const parsed = parseFloat(cleanStr);
      const finalVal = isNaN(parsed) ? 0 : parsed;
      onSave(finalVal);
      setLocalVal(finalVal === 0 ? "0" : finalVal.toString());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitValue();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setLocalVal(value === 0 ? "0" : value.toString());
        e.currentTarget.blur();
      }
    };

    return (
      <input
        type="text"
        disabled={disabled}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        className={`text-right w-20 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 px-0.5 py-0.5 font-mono font-black transition rounded focus:bg-slate-50/50 ${
          disabled ? "line-through text-slate-400 cursor-not-allowed" : "text-slate-800"
        }`}
      />
    );
  }

  // Controlled input component for tracker row category title that updates parent on Enter or Blur
  function TrackerRowCategoryInput({
    value,
    onSave,
    disabled
  }: {
    value: string;
    onSave: (val: string) => void;
    disabled?: boolean;
  }) {
    const [localVal, setLocalVal] = useState(value);

    useEffect(() => {
      setLocalVal(value);
    }, [value]);

    const commitValue = () => {
      onSave(localVal);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitValue();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setLocalVal(value);
        e.currentTarget.blur();
      }
    };

    return (
      <input
        type="text"
        disabled={disabled}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 py-0.5 px-0.5 font-bold text-slate-800 focus:text-slate-950 text-xs transition-colors duration-150 ${
          disabled ? "line-through italic text-slate-400 cursor-not-allowed" : ""
        }`}
        placeholder="Category Title"
      />
    );
  }

  // Controlled input component for tracker row description/notes that updates parent on Enter or Blur
  function TrackerRowDescriptionInput({
    value,
    onSave,
    disabled
  }: {
    value: string;
    onSave: (val: string) => void;
    disabled?: boolean;
  }) {
    const [localVal, setLocalVal] = useState(value);

    useEffect(() => {
      setLocalVal(value);
    }, [value]);

    const commitValue = () => {
      onSave(localVal);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitValue();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setLocalVal(value);
        e.currentTarget.blur();
      }
    };

    return (
      <input
        type="text"
        disabled={disabled}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 py-0.5 px-0.5 text-slate-500 text-[11px] focus:text-slate-800 transition"
        placeholder=""
      />
    );
  }

  // One-Year Project Cost Tracker Subcomponent (Renders the Monthly budget table based on PDF/OCR)
  function MonthlyCostTrackerComponent({ catId, compId, compName }: { catId: string; compId: string; compName: string }) {
    const selectedVendorId = trackerVendorSelections[`${catId}-${compId}`] || project.vendors[0]?.id || "";
    const activeVendor = project.vendors.find(v => v.id === selectedVendorId) || project.vendors[0];
    
    if (!activeVendor) {
      return <div className="text-xs text-rose-500 font-semibold p-2">Please add a vendor first to begin detailed tracking.</div>;
    }
    
    const rows = getMonthlyTrackerRows(catId, compId, activeVendor.id);
    
    const selectVendor = (vendorId: string) => {
      setTrackerVendorSelections(prev => ({
        ...prev,
        [`${catId}-${compId}`]: vendorId
      }));
    };

    const handleFieldChange = (rowId: string, field: keyof MonthlyCostTrackerRow, value: any) => {
      const updatedRows = rows.map(r => {
        if (r.id === rowId) {
          return { ...r, [field]: value };
        }
        return r;
      });
      updateMonthlyTracker(catId, compId, activeVendor.id, updatedRows);
    };

    const handleMonthChange = (rowId: string, monthIndex: number, val: number) => {
      const updatedRows = rows.map(r => {
        if (r.id === rowId) {
          const freshMonths = [...r.months];
          freshMonths[monthIndex] = val;
          return { ...r, months: freshMonths };
        }
        return r;
      });
      updateMonthlyTracker(catId, compId, activeVendor.id, updatedRows);
    };

    const toggleRowExcluded = (rowId: string) => {
      const updatedRows = rows.map(r => {
        if (r.id === rowId) {
          return { ...r, excluded: !r.excluded };
        }
        return r;
      });
      updateMonthlyTracker(catId, compId, activeVendor.id, updatedRows);
    };

    const deleteRow = (rowId: string, rowName: string) => {
      const updatedRows = rows.filter(r => r.id !== rowId);
      updateMonthlyTracker(catId, compId, activeVendor.id, updatedRows);
      showToast(`Removed "${rowName || "Cost Category"}" row from monthly tracker.`);
    };

    const addCustomRow = () => {
      const newId = `row-custom-${Math.random().toString(36).substring(2, 7)}`;
      const newRow: MonthlyCostTrackerRow = {
        id: newId,
        category: "Custom Cost Category",
        annualBudget: 0,
        months: Array(12).fill(0),
        description: "",
        excluded: false
      };
      updateMonthlyTracker(catId, compId, activeVendor.id, [...rows, newRow]);
      showToast("Added new custom category to tracker!");
    };

    // Calculate totals across columns
    const monthsTotals = Array(12).fill(0);
    let grandBudgetTotal = 0;
    
    rows.forEach(r => {
      if (!r.excluded) {
        grandBudgetTotal += r.annualBudget;
        r.months.forEach((m, idx) => {
          monthsTotals[idx] += m;
        });
      }
    });

    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return (
      <div className="bg-slate-50 border border-slate-200/90 shadow-xs rounded-xl p-4 overflow-hidden text-left font-sans print:bg-white print:border-slate-300">
        
        {/* Header containing title and active vendor info */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3.5 mb-4 border-b border-slate-200 gap-3.5">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-cyan-600 shrink-0" />
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Category & Month-wise Breakdown — <span className="text-cyan-705 font-extrabold">{compName}</span> <span className="text-indigo-650 font-normal">({activeVendor.name})</span>
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Based on the 1-Year cost structure. Edit cells directly to update the pricing cell of the selected vendor.
            </p>
          </div>
        </div>

        {/* Tracker Table Wrapper */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-3xs max-w-full">
          <table className="min-w-[1100px] w-full divide-y divide-slate-150">
            <thead>
              <tr className="bg-slate-105 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center select-none">
                <th scope="col" className="w-[4%] px-2 py-2.5 text-center">Inc</th>
                <th scope="col" className="w-[18%] px-3 py-2.5 text-left text-slate-700 font-extrabold">Cost Category</th>
                <th scope="col" className="w-[12%] px-3 py-2.5 text-right font-extrabold text-[#0f766e]">Annual Recurring Charges</th>
                {monthNamesShort.map((m) => (
                  <th key={m} scope="col" className="px-1 py-2.5 text-right w-[4.5%] text-[9.5px]">{m}</th>
                ))}
                <th scope="col" className="w-[20%] px-3 py-2.5 text-left font-extrabold text-slate-600 font-sans">Description / Notes</th>
                <th scope="col" className="w-[5%] px-2 py-2.5 text-center print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr 
                  key={row.id} 
                  className={`hover:bg-slate-50/40 divide-x divide-slate-50 transition-colors ${
                    row.excluded ? "bg-slate-100/50 opacity-55" : ""
                  }`}
                >
                  {/* Inclusion Toggle Column */}
                  <td className="px-2 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => toggleRowExcluded(row.id)}
                      className={`p-1 rounded cursor-pointer transition flex items-center justify-center mx-auto ${
                        row.excluded 
                          ? "text-slate-300 hover:text-emerald-600 hover:bg-slate-100 bg-slate-50" 
                          : "text-emerald-600 hover:text-rose-600 bg-emerald-50/40"
                      }`}
                      title={row.excluded ? "Currently excluded. Click to include in total budget" : "Currently included. Click to exclude from total budget"}
                    >
                      {row.excluded ? (
                        <X size={10} className="stroke-[3px]" />
                      ) : (
                        <Check size={10} className="stroke-[3px]" />
                      )}
                    </button>
                  </td>

                  {/* Category Name Column */}
                  <td className="px-3 py-2 text-left">
                    <TrackerRowCategoryInput
                      value={row.category}
                      disabled={row.excluded}
                      onSave={(val) => handleFieldChange(row.id, "category", val)}
                    />
                  </td>

                  {/* Annual Budget Total Column */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end font-mono font-black text-[#0f766e]">
                      <span className="text-[10px] text-teal-600/70 mr-0.5 select-none font-sans">$</span>
                      <TrackerAnnualBudgetInput
                        value={row.annualBudget}
                        disabled={row.excluded}
                        onSave={(val) => handleFieldChange(row.id, "annualBudget", val)}
                      />
                    </div>
                  </td>

                  {/* Monthly Breakdown Columns (Garunanteed 12 months, including DEC) */}
                  {Array.from({ length: 12 }).map((_, mIdx) => {
                    const mVal = row.months[mIdx] ?? 0;
                    return (
                      <td key={mIdx} className="px-1 py-2 text-right font-mono">
                        <MonthAmountInput
                          value={mVal}
                          disabled={row.excluded}
                          onSave={(val) => handleMonthChange(row.id, mIdx, val)}
                        />
                      </td>
                    );
                  })}

                  {/* Description Column */}
                  <td className="px-3 py-2 text-left font-sans">
                    <TrackerRowDescriptionInput
                      value={row.description}
                      disabled={row.excluded}
                      onSave={(val) => handleFieldChange(row.id, "description", val)}
                    />
                  </td>

                  {/* Actions Column */}
                  <td className="px-2 py-2 text-center print:hidden">
                    <button
                      type="button"
                      onClick={() => deleteRow(row.id, row.category)}
                      className="p-1 text-slate-300 hover:text-rose-500 rounded hover:bg-slate-100 transition cursor-pointer mx-auto flex items-center justify-center"
                      title="Delete category row"
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Grand Total Tracker Row */}
              <tr className="bg-cyan-50/50 border-t-2 border-[#b0dfeb] print:bg-slate-50 print:border-slate-300 font-bold">
                <td className="px-2 py-2.5 text-center text-cyan-800 font-black">Σ</td>
                <td className="px-3 py-2.5 text-cyan-800 font-extrabold uppercase text-[10px] tracking-wider text-left">Grand Total</td>
                
                {/* Grand Budget Total Cell */}
                <td className="px-3 py-2.5 text-right font-mono font-black text-[#0f766e] text-[13px]">
                  {formatCurrency(grandBudgetTotal)}
                </td>

                {/* Monthly Totals Columns */}
                {monthsTotals.map((mTot, idx) => (
                  <td key={idx} className="px-1 py-2.5 text-right font-mono text-[11px] text-cyan-800 font-black">
                    {mTot === 0 ? "0" : mTot.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </td>
                ))}

                {/* Leftover slots */}
                <td className="px-3 py-2.5 text-left font-semibold text-slate-400 text-[10.5px] italic font-sans select-none">Sum totals computed automatically</td>
                <td className="px-2 py-2.5 print:hidden"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center mt-3 pt-1.5 print:hidden">
          <button
            type="button"
            onClick={addCustomRow}
            className="flex items-center gap-1.5 text-[11px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold shadow-3xs transition cursor-pointer"
          >
            <Plus size={12} className="text-emerald-600" />
            Add Custom Breakdown Row
          </button>
          
          <span className="text-[10px] text-slate-400 font-bold">
            * Parent cell total auto-calculated: {formatCurrency(grandBudgetTotal)}
          </span>
        </div>
      </div>
    );
  }

  // Project Switching & Cloning & Resets
  const createNewProject = () => {
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newProjId = `project-${randomHex}`;
    const newProj: QuoteProject = {
      id: newProjId,
      name: `Quote Comparison Project ${projects.length + 1}`,
      date: new Date().toISOString().split('T')[0],
      version: "v1.0",
      currency: "USD",
      vendors: [
        { id: "vendor-a", name: "Vendor A" },
        { id: "vendor-b", name: "Vendor B" },
      ],
      categories: [
        {
          id: "e-invoicing",
          name: "e-Invoicing",
          components: [
            { id: "setup-cost", name: "Setup Cost" },
            { id: "one-time-integration", name: "One-time Integration" },
            { id: "annual-fee-year-1", name: "Annual Fee — Year 1" },
            { id: "annual-fee-year-2", name: "Annual Fee — Year 2" },
          ]
        }
      ],
      costValues: {
        "e-invoicing": {
          "setup-cost": { "vendor-a": 0, "vendor-b": 0 },
          "one-time-integration": { "vendor-a": 0, "vendor-b": 0 },
          "annual-fee-year-1": { "vendor-a": 0, "vendor-b": 0 },
          "annual-fee-year-2": { "vendor-a": 0, "vendor-b": 0 }
        }
      },
      comments: {
        "e-invoicing": ""
      },
      vendorNotes: {
        "vendor-a": "",
        "vendor-b": ""
      },
      generalNotes: "New vendor analysis report."
    };

    setProjects(prev => [...prev, newProj]);
    setActiveProjectId(newProjId);
    showToast("Created a new comparison template!");
  };

  const cloneCurrentProject = () => {
    const randomHex = Math.random().toString(36).substring(2, 7);
    const newProjId = `project-${randomHex}`;
    const cloned: QuoteProject = JSON.parse(JSON.stringify(project));
    cloned.id = newProjId;
    cloned.name = `${cloned.name} (Copy)`;
    cloned.date = new Date().toISOString().split('T')[0];

    // Clone scorecard data as well
    const scCopy = scorecards[project.id] ? JSON.parse(JSON.stringify(scorecards[project.id])) : null;
    if (scCopy) {
      setScorecards(prev => ({
        ...prev,
        [newProjId]: scCopy
      }));
    }

    setProjects(prev => [...prev, cloned]);
    setActiveProjectId(newProjId);
    showToast(`Cloned comparison model: "${cloned.name}"`);
  };

  const resetToSample = () => {
    setConfirmDialog({
      title: "Overwrite with Initial Template",
      message: "This will overwrite the current project with the default sample data. Proceed?",
      onConfirm: () => {
        // Find default template
        const template = DEFAULT_PROJECTS[0];
        const resetProject = JSON.parse(JSON.stringify(template));
        resetProject.id = project.id; // Preserve active ID
        
        setProjects(prev => prev.map(p => p.id === project.id ? resetProject : p));
        
        // Reset scorecard
        setScorecards(prev => ({
          ...prev,
          [project.id]: {
            "vendor-a": { technical: 4, support: 5, ease: 3, value: 4 },
            "vendor-b": { technical: 5, support: 4, ease: 4, value: 3 },
            "vendor-c": { technical: 2, support: 2, ease: 5, value: 4 },
            "vendor-new": { technical: 1, support: 1, ease: 1, value: 1 },
          }
        }));

        showToast("Restored initial test data comparison state!");
      }
    });
  };

  const deleteCurrentProject = async () => {
    if (projects.length <= 1) {
      showToast("Cannot delete the last remaining project.", "error");
      return;
    }

    setConfirmDialog({
      title: "Delete Comparison Project",
      message: `Are you sure you want to delete comparison project "${project.name}"?`,
      onConfirm: async () => {
        const idToDelete = project.id;
        const remaining = projects.filter(p => p.id !== idToDelete);
        setProjects(remaining);
        setActiveProjectId(remaining[0].id);
        showToast("Deleted comparison project.");

        if (isFirebaseConfigured && db) {
          try {
            const deletePromise = deleteDoc(doc(db, "projects", idToDelete));
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Timeout deleting document")), 3000);
            });
            await Promise.race([deletePromise, timeoutPromise]);
            console.log(`Document ${idToDelete} deleted successfully from Firestore.`);
          } catch (err: any) {
            console.error(`Failed to delete document ${idToDelete} from Firestore:`, err);
            const errMsg = err?.message || String(err);
            if (errMsg.includes("resource-exhausted") || errMsg.includes("Quota exceeded") || errMsg.includes("Timeout") || err?.code === "resource-exhausted") {
              setIsQuotaExceeded(true);
            }
          }
        }
      }
    });
  };

  // Export JSON file
  const exportToJson = () => {
    const exportObj = {
      project,
      scorecard: scorecards[project.id] || {}
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    const fileName = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_quote_comparison.json`;
    downloadAnchor.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("JSON comparison model exported successfully!");
  };

  // Export currently active project table data to a beautifully styled Excel workbook
  const exportToExcel = () => {
    try {
      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const fileName = `${safeName}_quote_comparison_report.xls`;

      // Premium CSS style definitions supported by Microsoft Excel
      let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]>
        <xml>
         <x:ExcelWorkbook>
          <x:ExcelWorksheets>
           <x:ExcelWorksheet>
            <x:Name>Comparison sheet</x:Name>
            <x:WorksheetOptions>
             <x:DisplayGridlines/>
            </x:WorksheetOptions>
           </x:ExcelWorksheet>
          </x:ExcelWorksheets>
         </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; }
          table { border-collapse: collapse; margin-bottom: 24px; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 11px; text-align: left; }
          th { font-weight: bold; background-color: #1e3a8a; color: #ffffff; font-size: 11px; text-transform: uppercase; }
          .num-col { text-align: right; }
          .title { font-size: 18px; font-weight: bold; color: #1e3a8a; padding-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; padding-bottom: 12px; }
          .section-header { background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 11px; text-transform: uppercase; padding: 10px; }
          .meta-label { font-weight: bold; color: #475569; width: 150px; background-color: #f8fafc; }
          .meta-val { color: #1e293b; background-color: #f8fafc; }
          .cat-header { background-color: #e0f2fe; color: #0369a1; font-weight: bold; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #bae6fd; }
          .total-row { background-color: #f8fafc; font-weight: bold; border-top: 1.5px solid #94a3b8; }
          .grand-total { background-color: #d1fae5; font-weight: bold; font-size: 11px; color: #065f46; border-top: 2px solid #059669; border-bottom: 3px double #059669; }
          .score-row { font-weight: bold; background-color: #fef3c7; color: #b45309; }
        </style>
        </head>
        <body>
          <div class="title">${project.name}</div>
          <div class="subtitle">Generated dynamically on ${formatDateDDMMYYYY(project.date)} | TCO Duration: ${tcoYears} Years | Currency Basis: ${project.currency}</div>
          
          <table>
            <tr><td class="meta-label">Sheet Version</td><td class="meta-val" colspan="${project.vendors.length}">${project.version}</td></tr>
            <tr><td class="meta-label">Currency Code</td><td class="meta-val" colspan="${project.vendors.length}">${project.currency}</td></tr>
            <tr><td class="meta-label">Projection Limit</td><td class="meta-val" colspan="${project.vendors.length}">${tcoYears} Years TCO</td></tr>
          </table>

          <br/>
          <table>
            <thead>
              <tr class="section-header">
                <th colspan="${project.vendors.length + 1}">SECTION 1: TCO COST BREAKDOWN MATRIX (${tcoYears} Year projection)</th>
              </tr>
              <tr>
                <th>Cost Category / Line Component</th>
                ${project.vendors.map(v => `<th class="num-col">${v.name} (${project.currency})</th>`).join("")}
              </tr>
            </thead>
            <tbody>
      `;

      project.categories.forEach(cat => {
        html += `
          <tr class="cat-header">
            <td colspan="${project.vendors.length + 1}">[Category] ${cat.name}</td>
          </tr>
        `;
        cat.components.forEach(comp => {
          const factor = getComponentScaleFactor(comp.name, comp.id, tcoYears, cat.components);
          html += `
            <tr>
              <td>&nbsp;&nbsp;• ${comp.name} ${factor > 1 ? `(x${factor} scale)` : factor === 0 ? '(Excluded)' : '(One-time)'}</td>
              ${project.vendors.map(v => {
                const rawVal = project.costValues[cat.id]?.[comp.id]?.[v.id] ?? 0;
                const scaledVal = rawVal * factor;
                return `<td class="num-col">${scaledVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
              }).join("")}
            </tr>
          `;
        });
        html += `
          <tr class="total-row">
            <td>&nbsp;&nbsp;<b>${cat.name} Total</b></td>
            ${project.vendors.map(v => {
              const totalVal = getCategoryTotalForVendor(cat.id, v.id);
              return `<td class="num-col"><b>${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>`;
            }).join("")}
          </tr>
        `;
      });

      html += `
            <tr class="grand-total">
              <td><b>GRAND TOTAL TCO ESTIMATE</b></td>
              ${project.vendors.map(v => {
                const grandVal = getVendorGrandTotal(v.id);
                return `<td class="num-col"><b>${grandVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>`;
              }).join("")}
            </tr>
        </tbody>
      </table>
      
      <br/>
      <table>
        <thead>
          <tr class="section-header">
            <th colspan="${project.vendors.length + 2}">SECTION 2: QUALITATIVE EVALUATION SCORECARD</th>
          </tr>
          <tr>
            <th style="width: 200px;">Evaluation Criteria</th>
            <th style="width: 300px;">Metric Description / KPI Details</th>
            ${project.vendors.map(v => `<th class="num-col">${v.name} (1-5 Rating)</th>`).join("")}
          </tr>
        </thead>
        <tbody>
      `;

      const criteriaList = project.criteria || [
        { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
        { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
        { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
        { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
      ];

      criteriaList.forEach(crit => {
        html += `
          <tr>
            <td><b>${crit.name}</b></td>
            <td>${crit.description}</td>
            ${project.vendors.map(v => {
              const score = scorecards[project.id]?.[v.id]?.[crit.id] || 3;
              return `<td class="num-col">${score} Stars</td>`;
            }).join("")}
          </tr>
        `;
      });

      html += `
          <tr class="score-row">
            <td colspan="2"><b>Overall Scorecard Average Rating (Mean Value)</b></td>
            ${project.vendors.map(v => {
              const avg = getVendorScorecardAvg(v.id);
              return `<td class="num-col"><b>${avg > 0 ? `${avg.toFixed(2)} / 5.0` : "—"}</b></td>`;
            }).join("")}
          </tr>
        </tbody>
      </table>

      <br/>
      <table>
        <thead>
          <tr class="section-header">
            <th colspan="2">SECTION 3: STRATEGIC ROLLING COMMENTARY & NOTES</th>
          </tr>
          <tr>
            <th style="width: 200px;">Vendor Item</th>
            <th>Procurement Analysis Notes</th>
          </tr>
        </thead>
        <tbody>
      `;

      project.vendors.forEach(v => {
        const note = project.vendorNotes?.[v.id] || "No strategic supplier notes specified.";
        html += `
          <tr>
            <td><b>${v.name}</b></td>
            <td>${note}</td>
          </tr>
        `;
      });

      html += `
          <tr>
             <td><b>General Assessment Notes</b></td>
             <td>${project.generalNotes || "No specific general procurement actions mentioned."}</td>
          </tr>
        </tbody>
      </table>
      </body>
      </html>
      `;

      // Download triggered via standard Blob saved with .xls suffix
      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const downloadUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", downloadUrl);
      downloadAnchor.setAttribute("download", fileName);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(downloadUrl);

      showToast("Professional Excel Book generated and downloaded!");
    } catch (err: any) {
      console.error(err);
      showToast("Excel export operation failed", "error");
    }
  };

  // Import JSON file
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonStr = event.target?.result as string;
        const parsed = JSON.parse(jsonStr);

        let importedProjectsList: any[] = [];
        let scorecardData: any = null;

        if (Array.isArray(parsed)) {
          importedProjectsList = parsed;
        } else if (parsed.projects && Array.isArray(parsed.projects)) {
          importedProjectsList = parsed.projects;
          scorecardData = parsed.scorecards || parsed.scorecard || null;
        } else if (parsed.quote_compare_projects && Array.isArray(parsed.quote_compare_projects)) {
          importedProjectsList = parsed.quote_compare_projects;
          scorecardData = parsed.quote_compare_scorecards || parsed.scorecards || parsed.scorecard || null;
        } else {
          // It's a single project wrapper or direct project
          let singleProj: any = null;
          if (parsed.project && typeof parsed.project === "object") {
            singleProj = parsed.project;
            scorecardData = parsed.scorecard || null;
          } else if (parsed.vendors && parsed.categories && parsed.costValues) {
            singleProj = parsed;
          } else {
            // Let's search inside the keys of parsed to see if any key has vendors and categories (nested)
            const potentialProjectKey = Object.keys(parsed).find(
              key => parsed[key] && typeof parsed[key] === "object" && parsed[key].vendors && parsed[key].categories
            );
            if (potentialProjectKey) {
              singleProj = parsed[potentialProjectKey];
              scorecardData = parsed.scorecard || parsed.scorecards?.[singleProj.id] || null;
            } else {
              // Try searching for any array key whose first element has vendors and categories (nested list)
              const potentialArrayKey = Object.keys(parsed).find(
                key => Array.isArray(parsed[key]) && parsed[key].length > 0 && parsed[key][0].vendors && parsed[key][0].categories
              );
              if (potentialArrayKey) {
                importedProjectsList = parsed[potentialArrayKey];
                scorecardData = parsed.quote_compare_scorecards || parsed.scorecards || parsed.scorecard || null;
              }
            }
          }
          if (singleProj) {
            importedProjectsList = [singleProj];
          }
        }

        if (importedProjectsList.length === 0) {
          throw new Error("Invalid format. The JSON file must contain a valid quote comparison project with vendors, categories, and cost values.");
        }

        const normalizedProjects = importedProjectsList.map((proj, idx) => {
          const randomHex = Math.random().toString(36).substring(2, 7) + "-" + idx;
          const newId = `imported-${randomHex}`;
          const oldId = proj.id;

          // Preserve every original field on the imported object to never leave fields empty,
          // while ensuring correct unique IDs and required structures.
          const normalized: QuoteProject = {
            ...proj,
            id: newId,
            name: proj.name ? (proj.name.endsWith("(Imported)") ? proj.name : `${proj.name} (Imported)`) : `Imported Comparison ${idx + 1}`,
            vendors: Array.isArray(proj.vendors) ? proj.vendors : (proj.vendors || []),
            categories: Array.isArray(proj.categories) ? proj.categories : (proj.categories || []),
            costValues: proj.costValues || {},
          };

          // If there is any scorecard details in the imported JSON
          if (scorecardData) {
            // scorecardData could be a single scorecard (for a single project backup) or a dictionary of scorecards
            const sc = scorecardData[oldId] || scorecardData;
            if (sc && typeof sc === "object") {
              setScorecards(prev => ({
                ...prev,
                [newId]: sc
              }));
            }
          } else if (parsed.scorecards && parsed.scorecards[oldId]) {
            setScorecards(prev => ({
              ...prev,
              [newId]: parsed.scorecards[oldId]
            }));
          }

          return normalized;
        });

        setProjects(prev => [...prev, ...normalizedProjects]);
        setActiveProjectId(normalizedProjects[0].id);

        setImportError(null);
        showToast(`Successfully imported comparison model: "${normalizedProjects[0].name}"`);
      } catch (err: any) {
        setImportError(`Failed to load file: ${err.message || "Invalid JSON format"}`);
        showToast("Import failed", "error");
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = "";
  };

  // Currency select handler
  const handleCurrencyChange = (currency: string) => {
    const updated = { ...project };
    updated.currency = currency;
    updateCurrentProject(updated);
    showToast(`Currency changed to ${currency}`);
  };

  // Render Stacked Bar SVG heights calculation
  // Returns relative heights and visual segments for rendering custom SVG
  const getChartData = () => {
    const data = project.vendors.map(v => {
      const gTotal = getVendorGrandTotal(v.id);
      
      // Calculate split per category
      const categoriesSplit = project.categories.map((cat, idx) => {
        const catTotal = getCategoryTotalForVendor(cat.id, v.id);
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          value: catTotal,
          color: Object.values(CATEGORY_COLORS)[idx % Object.values(CATEGORY_COLORS).length] || CATEGORY_COLORS.default
        };
      });

      return {
        vendorId: v.id,
        vendorName: v.name,
        grandTotal: gTotal,
        splits: categoriesSplit
      };
    });

    const maxTotal = Math.max(...data.map(d => d.grandTotal), 1000); // Minimum 1000 threshold to keep bars nicely proportioned
    return { data, maxTotal };
  };

  const { data: chartData, maxTotal } = getChartData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased flex flex-col pb-24 print:bg-white print:pb-0 relative overflow-hidden">
      {/* Mesh Gradient Background Accents */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-100 rounded-full blur-[120px] opacity-60 pointer-events-none"></div>
      <div className="absolute top-1/2 -right-24 w-85 h-85 bg-indigo-100 rounded-full blur-[110px] opacity-50 pointer-events-none"></div>
      <div className="absolute -bottom-24 left-1/3 w-80 h-80 bg-teal-50 rounded-full blur-[100px] opacity-40 pointer-events-none"></div>
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 animate-slide-up print:hidden">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/40 bg-white/75 backdrop-blur-md shadow-xs print:relative print:border-0 print:shadow-none print:bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-md shadow-indigo-100">
              Q
            </div>
            <div>
              <h1 className="text-base font-extrabold text-indigo-600 leading-none">VORTEX QuoteRank</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Strategic Procurement Suite</p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button 
              onClick={createNewProject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition duration-150 cursor-pointer"
            >
              <PlusCircle size={14} /> Add Project
            </button>
            <button 
              onClick={cloneCurrentProject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition duration-150 cursor-pointer"
              title="Duplicate current sheet structure and records"
            >
              <Copy size={14} /> Clone
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            <button 
              onClick={exportToJson}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer"
              title="Download local JSON file backup"
            >
              <FileDown size={14} /> Export Backup
            </button>
            <button 
              onClick={triggerFileSelect}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer"
              title="Load saved comparison JSON back"
            >
              <FileUp size={14} /> Load Backup
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleJsonImport} 
              accept=".json" 
              className="hidden" 
            />
            <button 
              onClick={() => window.print()}
              className="p-1.5 ml-1 border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-150 transition cursor-pointer"
              title="Print to PDF Report"
            >
              <Printer size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full flex flex-col gap-8">
        
        {/* Project Selector Sidebar panel / info bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/40 pb-5 print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Vault:</span>
            <select
              value={activeProjectId}
              onChange={(e) => setActiveProjectId(e.target.value)}
              className="bg-white/80 border border-white/60 text-slate-800 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 max-w-xs shadow-3xs backdrop-blur-xs"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
            {projects.length > 1 && (
              <button
                onClick={deleteCurrentProject}
                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition text-xs font-semibold cursor-pointer"
                title="Delete current comparison"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* Perspective View switcher */}
          <div className="flex bg-slate-200/50 p-1.5 rounded-xl border border-slate-250/20 items-center gap-1 self-start md:self-auto shadow-2xs">
            <button
              onClick={() => {
                setActivePerspective("matrix");
                showToast("Switched to active comparison sheets");
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold rounded-lg transition-all duration-150 cursor-pointer ${
                activePerspective === "matrix"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
              }`}
            >
              <Layers size={13} />
              Comparison Sheets
            </button>
            <button
              onClick={() => {
                setActivePerspective("vendor");
                showToast("Switched to Side-by-Side Vendor Perspective");
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold rounded-lg transition-all duration-150 cursor-pointer ${
                activePerspective === "vendor"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
              }`}
            >
              <Award size={13} />
              Vendor Perspective & KPIs
            </button>
          </div>

          {importError && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs px-3 py-1.5 rounded-lg flex items-center justify-between gap-1">
              <span>{importError}</span>
              <button onClick={() => setImportError(null)} className="p-0.5 hover:bg-rose-100 rounded">
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* METADATA STRIP PANEL */}
        <section className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-6 md:p-8 shadow-xl flex flex-col gap-6 relative print:p-0 print:border-0 print:shadow-none">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex-1">
              <div className="group relative flex items-center">
                {editingField.type === "project-name" ? (
                  <div className="flex items-center gap-2 py-1 w-full max-w-lg">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveInlineEdit}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                      autoFocus
                      className="text-2xl md:text-3xl font-extrabold text-slate-900 border-b-2 border-indigo-500 focus:outline-hidden w-full pb-1"
                    />
                    <button onClick={saveInlineEdit} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                      <Check size={18} />
                    </button>
                    <button onClick={() => setEditingField({ type: null })} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h2 
                      onClick={() => startEditing("project-name", undefined, undefined, project.name)}
                      className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight cursor-pointer hover:text-indigo-600 transition"
                      title="Double-click to rename comparison sheet"
                    >
                      {project.name}
                    </h2>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1.5 max-w-xl">
                Dynamic cost comparison analysis & Total Cost of Ownership ({tcoYears} Years TCO). Set up custom components, dynamic columns, ratings, and executive summary.
              </p>
            </div>

            {/* Editable Fields strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4 bg-white/40 backdrop-blur-md p-4 py-3 rounded-xl border border-white/35 min-w-[280px] print:bg-transparent print:border-0 print:p-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                  <Calendar size={11} /> Review Date
                </span>
                {editingField.type === "project-date" ? (
                  <input
                    type="date"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveInlineEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                    autoFocus
                    className="text-xs font-semibold text-slate-800 bg-white border border-indigo-200 px-1 py-0.5 rounded focus:outline-hidden"
                  />
                ) : (
                  <span 
                    onClick={() => startEditing("project-date", undefined, undefined, project.date)}
                    className="text-xs font-semibold text-slate-800 cursor-pointer hover:text-indigo-600 transition"
                  >
                    {formatDateDDMMYYYY(project.date)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                  Version
                </span>
                {editingField.type === "project-version" ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveInlineEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                    autoFocus
                    className="text-xs font-semibold text-slate-800 bg-white border border-indigo-200 px-1 py-0.5 rounded focus:outline-hidden w-20"
                  />
                ) : (
                  <span 
                    onClick={() => startEditing("project-version", undefined, undefined, project.version)}
                    className="text-xs font-semibold text-slate-800 cursor-pointer hover:text-indigo-600 transition"
                  >
                    {project.version}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                  <DollarSign size={11} /> Currency Basis
                </span>
                <select
                  value={project.currency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden border-b border-dashed border-slate-300 hover:border-indigo-500 cursor-pointer pb-0.5 max-w-[80px]"
                >
                  {Object.keys(CURRENCY_SYMBOLS).map(c => (
                    <option key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                  <Clock size={11} /> TCO Duration
                </span>
                <div className="flex items-center gap-1 mt-1 print:hidden flex-wrap">
                  {Array.from({ length: maxYearsCount }, (_, i) => i + 1).map((y) => (
                    <button
                      key={y}
                      onClick={() => {
                        setTcoYears(y);
                        showToast(`Projection duration modified to ${y} year${y > 1 ? 's' : ''}`);
                      }}
                      className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                        tcoYears === y 
                          ? "bg-indigo-600 text-white shadow-xs" 
                          : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      {y}-Yr
                    </button>
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-800 hidden print:inline">
                  {tcoYears} Years TCO
                </span>
              </div>
            </div>
          </div>

          {/* BRUSH BENTO METRIC STATS & CHART VISUALS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2">
            
            {/* Stats Briefing Box (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              
              {/* Card 1: Cheapest option highlighted */}
              <div className="bg-emerald-50/40 backdrop-blur-md border border-emerald-200/50 rounded-xl p-5 flex flex-col gap-3 shadow-xs h-full justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-emerald-200/30 pb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">Financial Value Pick</span>
                    <Award size={16} className="text-emerald-600" />
                  </div>
                  {(() => {
                    const selectedOptionsGrandTotalBreakdown = getSelectedOptionsGrandTotalBreakdown();
                    const selectedOptionsGrandTotal = selectedOptionsGrandTotalBreakdown.oneTime + selectedOptionsGrandTotalBreakdown.recurring;

                    if (selectedOptionsGrandTotal > 0) {
                      return (
                        <div className="flex flex-col gap-2">
                          {/* Cost Components split category-wise */}
                          <div className="mt-2 border-t border-emerald-200/30 pt-2.5 flex flex-col gap-4 max-h-[250px] overflow-y-auto pr-1">
                            {project.categories.map(cat => {
                              const selectedVendorId = project.selectedVendorIds?.[cat.id];
                              if (!selectedVendorId) return null;

                              const selectedVendor = getCategoryVendors(cat).find(v => v.id === selectedVendorId) || project.vendors.find(v => v.id === selectedVendorId);
                              if (!selectedVendor) return null;

                              const breakdown = getCategoryTotalBreakdown(cat.id, selectedVendorId);
                              const total = breakdown.oneTime + breakdown.recurring;

                              // Retrieve components matching selected vendor for this category
                              const validCompItems = cat.components.map(comp => {
                                const isExcluded = isComponentExcluded(cat.id, comp.id);
                                if (isExcluded) return null;
                                const rawVal = project.costValues[cat.id]?.[comp.id]?.[selectedVendorId] ?? 0;
                                const factor = getComponentScaleFactor(comp.name, comp.id, tcoYears, cat.components);
                                const scaledVal = rawVal * factor;
                                if (scaledVal === 0) return null;
                                return { comp, scaledVal, factor };
                              }).filter((item): item is { comp: CostComponent; scaledVal: number; factor: number } => item !== null);

                              return (
                                <div key={cat.id} className="border-b border-slate-100/40 pb-2 flex flex-col gap-1.5">
                                  {/* Category Header */}
                                  <div className="flex items-center justify-between font-extrabold text-[10px] text-teal-850 tracking-wider uppercase">
                                    <span className="flex items-center gap-1">📁 {cat.name}</span>
                                  </div>
                                  
                                  {/* Category Specific Selected Vendor Banner */}
                                  <div className="flex items-center justify-between text-[11px] font-black text-emerald-800 bg-emerald-100/40 border border-emerald-200/45 px-2 py-1 rounded select-none">
                                    <span className="flex items-center gap-1">🏆 {selectedVendor.name}</span>
                                    <span className="font-mono">{formatCurrency(total)}</span>
                                  </div>

                                  {/* Components */}
                                  {validCompItems.length > 0 && (
                                    <div className="flex flex-col gap-1 pl-2.5 mb-1.5">
                                      {validCompItems.map(({ comp, scaledVal, factor }) => (
                                        <div key={`${cat.id}-${comp.id}`} className="flex items-center justify-between text-[10px] font-semibold leading-tight py-0.5 text-slate-655">
                                          <span className="truncate max-w-[140px]" title={comp.name}>
                                            • {comp.name} {factor > 1 ? `(x${factor})` : ""}
                                          </span>
                                          <span className="font-mono text-slate-700 shrink-0 font-bold">
                                            {formatCurrency(scaledVal)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Small font Grand Total footer per instructions */}
                          <div className="mt-3 border-t-2 border-double border-emerald-205 pt-2.5 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-655 uppercase tracking-widest">TCO Total</span>
                            <div className="flex flex-col items-end">
                              <span className="font-mono text-sm font-extrabold text-emerald-800">{formatCurrency(selectedOptionsGrandTotal)}</span>
                              {showDualConversion(selectedOptionsGrandTotal, "text-[9px] text-[#047857] font-bold font-mono")}
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-400 italic">No vendor selected in summaries yet</h4>
                          <p className="text-xs text-slate-400 mt-1">Select vendor options in Section 3 Summaries to display the consolidated financial summary here.</p>
                        </div>
                      );
                    }
                  })()}
                </div>
                <div className="text-[10px] text-slate-400 border-t border-slate-200/40 pt-4 mt-2 font-medium">
                  Dynamic calculations based on years parameter selection.
                </div>
              </div>
            </div>

            {/* Custom Responsive SVG Stacked TCO Chart (7 cols) */}
            <div className="lg:col-span-7 border border-white/40 rounded-2xl bg-white/35 backdrop-blur-md p-6 flex flex-col gap-4 relative justify-between print:hidden shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <BarChart size={16} className="text-indigo-600" /> TCO Financial Splittings
                  </h4>
                  <p className="text-[11px] text-slate-500">Visual comparison of total category contributions per vendor</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{tcoYears} Years Cumulative</span>
              </div>

              {/* SVG Core block */}
              <div className="w-full relative h-[180px] mt-4 flex items-end justify-around border-b border-slate-200 pb-2">
                {chartData.map((d) => {
                  const barHeightRatio = Math.min((d.grandTotal / maxTotal) * 130, 130); // scale max to 130px height

                  return (
                    <div key={d.vendorId} className="flex flex-col items-center flex-1 max-w-[90px] group relative">
                      
                      {/* Interactive Float Tag */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[10px] py-1.5 px-2.5 rounded-lg shadow-lg z-20 pointer-events-none transition-all duration-200 transform -translate-y-1 block max-w-[150px] text-center">
                        <span className="font-extrabold block border-b border-slate-700 pb-0.5 mb-1">{d.vendorName}</span>
                        <div className="flex flex-col gap-0.5 text-[9px] text-left">
                          {d.splits.map((s, idx) => (
                            <span key={idx}>{s.categoryName}: {formatCurrency(s.value)}</span>
                          ))}
                          <span className="font-bold text-emerald-400 mt-0.5 border-t border-slate-700 pt-0.5">Total: {formatCurrency(d.grandTotal)}</span>
                        </div>
                      </div>

                      {/* Stacked block columns */}
                      <div className="w-8 flex flex-col-reverse items-center justify-start rounded-t-md overflow-hidden relative cursor-pointer" style={{ height: `${barHeightRatio}px` }}>
                        {d.splits.map((s, splitIdx) => {
                          const segmentHeight = d.grandTotal > 0 ? (s.value / d.grandTotal) * barHeightRatio : 0;
                          if (segmentHeight <= 0) return null;
                          return (
                            <div 
                              key={splitIdx} 
                              className="w-full transition-all duration-150 hover:brightness-95 hover:scale-105" 
                              style={{ 
                                height: `${segmentHeight}px`,
                                backgroundColor: s.color,
                              }}
                              title={`${s.categoryName}: ${formatCurrency(s.value)}`}
                            />
                          );
                        })}
                        {d.grandTotal === 0 && (
                          <div className="absolute inset-0 border-2 border-dashed border-slate-200 text-slate-300 text-[10px] flex items-center justify-center font-bold">
                            $0
                          </div>
                        )}
                      </div>

                      <span className="text-[10px] font-bold text-slate-700 mt-2 truncate w-full text-center">
                        {d.vendorName}
                      </span>
                      <span className="text-[9px] text-slate-500 font-semibold font-mono">
                        {formatCurrency(d.grandTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Legends */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center text-[10px] font-bold text-slate-500 mt-2 border-t border-slate-100 pt-3">
                {project.categories.slice(0, 5).map((cat, idx) => {
                  const color = Object.values(CATEGORY_COLORS)[idx % Object.values(CATEGORY_COLORS).length] || CATEGORY_COLORS.default;
                  return (
                    <div key={cat.id} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs block" style={{ backgroundColor: color }}></span>
                      <span>{cat.name}</span>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>
        </section>

        {activePerspective === "vendor" ? (
          <section className="flex flex-col gap-8 animate-fade-in print:hidden">
            {/* KPI Summary Dashboard panel */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:grid-cols-4">
              
              {/* Card 1: Value Pick */}
              <div className="bg-emerald-50/45 border-l-4 border-emerald-500 rounded-r-xl p-4 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Financial Leader</span>
                  <span className="text-xs font-semibold text-slate-400 block mt-1">Most Competitive Price</span>
                  {cheapestVendor ? (
                    <div className="mt-2">
                      <span className="text-sm font-extrabold text-slate-900 block leading-tight truncate">{cheapestVendor.name}</span>
                      <span className="text-sm font-bold text-emerald-800 block mt-1">{formatCurrency(cheapestVendor.total)}</span>
                      {showDualConversion(cheapestVendor.total, "text-[10px] text-emerald-700 font-bold font-mono tracking-wide block mt-1")}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 block mt-2">No costs entered yet</span>
                  )}
                </div>
                <div className="text-[9px] text-slate-400 mt-3 font-mono">Based on grand total {tcoYears}-Year TCO projection</div>
              </div>

              {/* Card 2: Quality Leader */}
              <div className="bg-amber-50/45 border-l-4 border-[#d97706] rounded-r-xl p-4 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Quality Standard Frontrunner</span>
                  <span className="text-xs font-semibold text-slate-400 block mt-1">Highest Scorecard Rating</span>
                  {highestRatedVendor && highestRatedVendor.score > 0 ? (
                    <div className="mt-2">
                      <span className="text-sm font-extrabold text-slate-900 block leading-tight truncate">{highestRatedVendor.name}</span>
                      <span className="text-sm font-bold text-[#d97706] block mt-1">★ {highestRatedVendor.score.toFixed(2)} / 5.0</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 block mt-2">No scores entered yet</span>
                  )}
                </div>
                <div className="text-[9px] text-slate-400 mt-3 font-mono">Weighted score average across all categories</div>
              </div>

              {/* Card 3: Best Value Matching */}
              <div className="bg-blue-50/45 border-l-4 border-blue-500 rounded-r-xl p-4 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Best Value Matching</span>
                  <span className="text-xs font-semibold text-slate-400 block mt-1">Optimum Rating vs Cost Index</span>
                  {bestValueVendor && bestValueVendor.score > 0 ? (
                    <div className="mt-2">
                      <span className="text-sm font-extrabold text-slate-900 block leading-tight truncate">{bestValueVendor.name}</span>
                      <span className="text-[11px] font-semibold text-slate-505 block mt-0.5">Rating: {bestValueVendor.score.toFixed(1)}/5  |  TCO: {formatCurrency(bestValueVendor.total)}</span>
                      {showDualConversion(bestValueVendor.total, "text-[10px] text-blue-700 font-bold font-mono tracking-wide block mt-1")}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-555 block mt-2">No scoring data yet</span>
                  )}
                </div>
                <div className="text-[9px] text-slate-400 mt-3 font-mono">Computed ROI index based on performance metrics</div>
              </div>

              {/* Card 4: Baseline Benchmark Cost */}
              <div className="bg-indigo-50/45 border-l-4 border-indigo-500 rounded-r-xl p-4 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-indigo-805 uppercase tracking-wider block">Average Baseline TCO</span>
                  <span className="text-xs font-semibold text-slate-400 block mt-1">Market Benchmark Cost</span>
                  <div className="mt-2">
                    <span className="text-sm font-extrabold text-slate-900 block leading-tight truncate">{formatCurrency(avgProjectCost)}</span>
                    {showDualConversion(avgProjectCost, "text-[11px] text-indigo-700 font-bold font-mono tracking-wide block mt-1")}
                    <span className="text-xs font-semibold text-indigo-705 block mt-1.5">Across {activeTotalsList.length} compared suppliers</span>
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 mt-3 font-mono">TCO metric baseline across all configurations</div>
              </div>

            </div>

            {/* Side-by-Side Supplier Detail Cards Grid */}
            <div className={`grid gap-6 ${
              project.vendors.length === 1 
                ? "grid-cols-1 max-w-xl mx-auto" 
                : project.vendors.length === 2 
                  ? "grid-cols-1 md:grid-cols-2" 
                  : "grid-cols-1 md:grid-cols-3"
            }`}>
              {project.vendors.map((v) => {
                const totalTCO = getVendorGrandTotal(v.id);
                const scoreAvg = getVendorScorecardAvg(v.id);
                const isSelected = project.recommendedVendorId === v.id;
                const isCheapestOpt = cheapestVendor && cheapestVendor.id === v.id && totalTCO > 0;
                
                return (
                  <div 
                    key={v.id} 
                    className={`bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col shadow-xs relative overflow-hidden ${
                      isSelected 
                        ? "border-[#d97706] ring-2 ring-amber-450/20 scale-[1.01] z-10 shadow-md" 
                        : "border-slate-100 hover:border-slate-300"
                    }`}
                  >
                    {/* Top Status Banner */}
                    {isSelected && (
                      <div className="bg-amber-450 text-slate-900 text-[10px] font-extrabold uppercase text-center py-1 tracking-widest leading-none select-none">
                        ★ FINAL SELECTED PROCUREMENT OPTION ★
                      </div>
                    )}

                    {/* Card Header Content */}
                    <div className="p-5 border-b border-slate-100 flex flex-col gap-3 select-none">
                      <div className="flex items-center justify-between gap-2">
                        {editingField.type === "vendor-name" && editingField.id === v.id ? (
                          <div className="flex items-center gap-1 select-none">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { 
                                if (e.key === "Enter") { saveInlineEdit(); }
                                if (e.key === "Escape") { setEditingField({ type: null }); }
                              }}
                              autoFocus
                              className="bg-white border-b border-indigo-500 font-extrabold text-slate-900 text-sm py-0.5 focus:outline-hidden w-28 bg-white"
                            />
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                              title="Save"
                            >
                              <Check size={14} className="stroke-[3]" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                              title="Cancel"
                            >
                              <X size={14} className="stroke-[3]" />
                            </button>
                          </div>
                        ) : (
                          <h4 
                            onClick={() => startEditing("vendor-name", v.id, undefined, v.name)}
                            className="text-base font-black text-slate-900 truncate hover:text-indigo-600 cursor-pointer border-b border-transparent hover:border-slate-350"
                            title="Click to rename vendor"
                          >
                            {v.name}
                          </h4>
                        )}
                        
                        <button
                          onClick={() => recommendVendor(v.id)}
                          className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all duration-150 border cursor-pointer uppercase tracking-tight ${
                            isSelected 
                              ? "bg-amber-500 border-amber-500 text-slate-900 shadow-xs" 
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
                          }`}
                          title="Flag this supplier option as the final selected path"
                        >
                          {isSelected ? "✓ Selected" : "Select Option"}
                        </button>
                      </div>

                      <div className="flex flex-col gap-0.5 mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100/50">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Projected Year {tcoYears} TCO</span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-base font-black text-slate-900">{formatCurrency(totalTCO)}</span>
                          {isCheapestOpt && (
                            <span className="text-[8px] px-1.5 py-0.5 uppercase tracking-wider text-emerald-800 bg-emerald-100 rounded font-extrabold select-none">Best Price</span>
                          )}
                        </div>
                        {showDualConversion(totalTCO, "text-[11px] font-bold text-slate-550 font-mono tracking-wide block leading-none mt-1")}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col gap-4 text-xs">
                      
                      {/* Scorecard average */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-slate-404 uppercase tracking-wider select-none">Evaluation Scorecard</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900">{scoreAvg.toFixed(2)} / 5</span>
                          <div className="flex text-amber-400">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i} className="text-xs">
                                {i < Math.round(scoreAvg) ? "★" : "☆"}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Checklist-like small breakdown */}
                        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                          {(project.criteria || [
                            { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
                            { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
                            { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
                            { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
                          ]).slice(0, 4).map((crit) => {
                            const val = scorecards[project.id]?.[v.id]?.[crit.id] || 0;
                            return (
                              <div key={crit.id} className="flex justify-between items-center bg-slate-50/50 border border-slate-100 p-2 rounded-lg">
                                <span className="text-[9px] font-medium text-slate-500 capitalize truncate max-w-[85px]" title={crit.name}>{crit.name}</span>
                                <span className="font-mono text-[9px] font-bold text-slate-700">{val > 0 ? `${val}⭐` : "—"}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Dynamic Qualitative Parameter rows */}
                      {getProjectQualitativeRows(project).map((row) => {
                        const val = row.values?.[v.id] || "";
                        return (
                          <div key={row.id} className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-justify leading-relaxed">
                            <span className="text-[9px] font-bold text-[#0369a1] uppercase tracking-wider">{row.name}</span>
                            {val ? (
                              <p className="text-slate-600 font-sans text-xs leading-normal">{val}</p>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No details entered.</span>
                            )}
                          </div>
                        );
                      })}

                      {/* Category-Specific Qualitative Parameters */}
                      {project.categories.map((cat) => {
                        const catRows = getCategoryQualitativeRows(project, cat.id);
                        return (
                          <div key={cat.id} className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                            <span className="text-[9px] font-black text-cyan-800 uppercase tracking-widest">{cat.name} Parameter Details</span>
                            <div className="flex flex-col gap-2.5 pl-1.5">
                              {catRows.map((row) => {
                                const val = row.values?.[v.id] || "";
                                return (
                                  <div key={row.id} className="flex flex-col gap-0.5 leading-normal">
                                    <span className="text-[9px] font-bold text-[#0369a1]">{row.name}</span>
                                    {val ? (
                                      <p className="text-slate-600 font-sans text-[11px] leading-relaxed text-justify">{val}</p>
                                    ) : (
                                      <span className="text-slate-400 italic text-[10px]">No details entered for this category.</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* Dossier proposal files */}
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Linked Supplier Files</span>
                        {getFilesForVendor(v.id).length > 0 ? (
                          <div className="flex flex-col gap-1 mt-1">
                            {getFilesForVendor(v.id).map((f) => (
                              <div
                                key={f.id}
                                onClick={() => setActiveViewFile(f)}
                                className="flex items-center gap-1.5 p-1.5 border border-slate-200 hover:border-cyan-300 rounded-lg hover:bg-cyan-50/10 cursor-pointer transition text-[11px] text-[#0e7490]"
                              >
                                <Paperclip size={11} className="text-cyan-600 font-bold" />
                                <span className="underline truncate max-w-[200px] font-mono leading-none">{f.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No specific contract proposal attachments.</span>
                        )}
                      </div>

                      {/* General qualitative notes */}
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Qualitative Supplier Commentary</span>
                        {project.vendorNotes?.[v.id] ? (
                          <p className="text-slate-600 font-sans text-xs leading-normal">{project.vendorNotes[v.id]}</p>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No notes declared yet. Double-click in Standard table component to add segment logs or annotations.</span>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {/* CORE SECTION 1: COST SEGMENT COMPARISONS (MAPPED CATEGORIES) */}
            <section className="flex flex-col gap-10">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md font-extrabold shadow-2xs">Stage 1</span>
                Component-Wise Pricing Matrices
              </h3>
              {/* Layout Quick-toggle */}
              <button
                onClick={() => {
                  const newVal = !transposeMatrix;
                  setTransposeMatrix(newVal);
                  showToast(newVal ? "Set Transposed Layout (Vendors as Rows)" : "Set Standard Layout (Components as Rows)");
                }}
                className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-indigo-600 bg-slate-100/80 hover:bg-indigo-50 px-2 py-1 rounded-md border border-slate-200/50 transition duration-150 cursor-pointer"
                title="Switch layout: Transpose Rows and Columns"
              >
                <RefreshCw size={11} className={transposeMatrix ? "rotate-180 duration-300" : "duration-300"} />
                Transpose Matrix ({transposeMatrix ? "Vendors as Rows" : "Components as Rows"})
              </button>
            </div>
            <button
              onClick={addNewCategory}
              className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold border border-indigo-100 transition duration-150 cursor-pointer print:hidden"
            >
              <PlusCircle size={14} /> Add Category Table
            </button>
          </div>

          <div className="flex flex-col gap-10">
            {project.categories.map((cat, catIdx) => {
              // Get category-specific values map
              const remarks = project.comments?.[cat.id] || "";
              
              return (
                <div 
                  key={cat.id} 
                  id={cat.id} 
                  className={`bg-white/55 backdrop-blur-xl rounded-2xl border overflow-hidden shadow-xl hover:shadow-2xl transition duration-200 flex flex-col relative group/card print:border-slate-300 print:shadow-none ${
                    draggedCategoryIndex === catIdx ? "opacity-30 border-dashed border-indigo-400 bg-indigo-50/10 scale-98" : "border-white/60"
                  }`}
                  onDragOver={(e) => handleCategoryDragOver(e, catIdx)}
                  onDrop={(e) => handleCategoryDrop(e, catIdx)}
                >
                  {/* Table area */}
                  <div className="flex-1 p-6 md:p-8 flex flex-col gap-4">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2">
                        {/* Drag Handle for Category reordering */}
                        <div
                          draggable
                          onDragStart={(e) => handleCategoryDragStart(e, catIdx)}
                          className="p-1 cursor-grab text-slate-300 hover:text-indigo-600 hover:bg-slate-50 rounded opacity-0 group-hover/card:opacity-100 transition duration-150 print:hidden flex items-center justify-center shrink-0"
                          title="Drag to reorder Category tables"
                        >
                          <GripVertical size={16} />
                        </div>

                        <span 
                          className="w-1.5 h-6 block rounded-full"
                          style={{ backgroundColor: Object.values(CATEGORY_COLORS)[catIdx % Object.values(CATEGORY_COLORS).length] || CATEGORY_COLORS.default }}
                        ></span>
                        {editingField.type === "category-name" && editingField.id === cat.id ? (
                          <div className="flex items-center gap-1.5 select-none">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { 
                                if (e.key === "Enter") { saveInlineEdit(); }
                                if (e.key === "Escape") { setEditingField({ type: null }); }
                              }}
                              autoFocus
                              className="text-lg font-bold text-slate-900 border-b border-indigo-500 focus:outline-hidden bg-white px-1"
                            />
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                              title="Save"
                            >
                              <Check size={14} className="stroke-[3]" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                              title="Cancel"
                            >
                              <X size={14} className="stroke-[3]" />
                            </button>
                          </div>
                        ) : (
                          <h4 
                            onClick={() => startEditing("category-name", cat.id, undefined, cat.name)}
                            className="text-lg font-bold text-slate-900 cursor-pointer hover:text-indigo-600 tracking-tight"
                            title="Click to rename category"
                          >
                            {cat.name}
                          </h4>
                        )}
                      </div>

                      {/* Action tools */}
                      <div className="flex items-center gap-2 print:hidden text-rose-500">
                        <button
                          onClick={() => deleteCategory(cat.id, cat.name)}
                          className="p-1.5 px-2.5 text-rose-500 hover:bg-rose-50 border border-rose-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          title="Delete this entire category and component values"
                        >
                          <Trash2 size={13} /> Delete Category
                        </button>
                      </div>
                    </div>

                    {/* Responsive table block with clean in-place editing inputs */}
                    <div className="overflow-x-auto w-full -mx-4 px-4 sm:mx-0 sm:px-0">
                      <div className="inline-block min-w-full align-middle">
                        {!transposeMatrix ? (
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead>
                              <tr className="bg-slate-50/70 rounded-lg print:bg-slate-50">
                                <th scope="col" className="px-4 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/3">
                                  Cost Component
                                </th>
                                
                                {/* Vendor column names */}
                                {getCategoryVendors(cat).map((vendor) => {
                                  const isSelected = project.selectedVendorIds?.[cat.id] === vendor.id;
                                  return (
                                    <th key={vendor.id} scope="col" className={`px-4 py-3.5 text-right text-xs font-bold uppercase tracking-widest relative group/vhead transition-all duration-200 ${isSelected ? "bg-emerald-50/75 border-x border-emerald-150 text-emerald-800" : "text-slate-400"}`}>
                                      <div className="flex flex-col items-end gap-1.5 group">
                                        <div className="flex items-center gap-1 justify-end w-full">
                                          {editingField.type === "vendor-name" && editingField.id === vendor.id && editingField.catId === cat.id ? (
                                            <div className="flex items-center gap-1 select-none text-right justify-end">
                                              <input
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => { 
                                                  if (e.key === "Enter") { saveInlineEdit(); }
                                                  if (e.key === "Escape") { setEditingField({ type: null }); }
                                                }}
                                                autoFocus
                                                className="text-right font-extrabold text-slate-900 border-b border-indigo-500 text-xs py-0.5 focus:outline-hidden w-24 bg-white"
                                              />
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                                                title="Save"
                                              >
                                                <Check size={11} className="stroke-[3]" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                                                className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                                                title="Cancel"
                                              >
                                                <X size={11} className="stroke-[3]" />
                                              </button>
                                            </div>
                                          ) : (
                                            <span
                                              onClick={() => startEditing("vendor-name", vendor.id, undefined, vendor.name, cat.id)}
                                              className="cursor-pointer hover:text-indigo-600 select-all border-b border-transparent hover:border-slate-300 font-extrabold text-slate-900 mr-1 truncate max-w-[130px] inline-block"
                                              title="Click to rename vendor column"
                                            >
                                              {vendor.name}
                                            </span>
                                          )}

                                          {/* Inline Vendor Delete Button */}
                                          <button 
                                            onClick={() => deleteVendor(vendor.id, vendor.name, cat.id)} 
                                            className="text-slate-400 hover:text-rose-500 rounded p-1 transition print:hidden shrink-0"
                                            title={`Remove ${vendor.name} from group`}
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>

                                        {/* "Selected" toggle button */}
                                        <button
                                          type="button"
                                          onClick={() => handleSelectVendor(cat.id, vendor.id)}
                                          className={`px-2.5 py-0.5 text-[9px] rounded-full font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1 select-none ${
                                            isSelected 
                                              ? "bg-emerald-600 text-white shadow-xs border border-emerald-650" 
                                              : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                                          }`}
                                          title={isSelected ? "Clear selection" : "Mark as selected"}
                                        >
                                          <Check size={9} className={isSelected ? "stroke-[3]" : "opacity-50"} />
                                          {isSelected ? "Selected" : "Select"}
                                        </button>
                                      </div>
                                    </th>
                                  );
                                })}
                                
                                <th scope="col" className="w-[40px] px-2 text-center text-xs font-bold text-slate-400 print:hidden"></th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-150 bg-white">
                              {cat.components.map((comp, compIdx) => {
                                const isExcluded = isComponentExcluded(cat.id, comp.id);
                                return (
                                  <React.Fragment key={comp.id}>
                                    <tr 
                                      className={`group/row hover:bg-slate-50/50 transition ${
                                      draggedComponentInfo?.catId === cat.id && draggedComponentInfo?.compIndex === compIdx 
                                        ? "opacity-35 bg-indigo-50/30 border-l-2 border-indigo-500" 
                                        : ""
                                    } ${isExcluded ? "bg-slate-50/55" : ""}`}
                                    onDragOver={(e) => handleComponentDragOver(e)}
                                    onDrop={(e) => handleComponentDrop(e, cat.id, compIdx)}
                                  >
                                    
                                    {/* Component label */}
                                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                                      <div className="flex items-center gap-2 group/grip">
                                        {/* Drag Handle for Component Row */}
                                        <div
                                          draggable
                                          onDragStart={(e) => handleComponentDragStart(e, cat.id, compIdx)}
                                          className="p-0.5 cursor-grab text-slate-300 hover:text-indigo-600 hover:bg-slate-50 rounded opacity-0 group-hover/row:opacity-100 transition duration-150 print:hidden shrink-0 flex items-center justify-center"
                                          title="Drag to reorder component row"
                                        >
                                          <GripVertical size={13} />
                                        </div>

                                        {/* Include/Exclude Toggle Button */}
                                        <button
                                          onClick={() => toggleCostComponentIncluded(cat.id, comp.id)}
                                          className={`p-1 rounded transition duration-150 print:hidden shrink-0 flex items-center justify-center cursor-pointer ${
                                            isExcluded
                                              ? "text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 bg-slate-100/60"
                                              : "text-emerald-600 hover:text-rose-600 hover:bg-rose-50 bg-emerald-50/40"
                                          }`}
                                          title={isExcluded ? "Currently excluded. Click to include in TCO totals" : "Currently included. Click to exclude from TCO totals"}
                                        >
                                          {isExcluded ? (
                                            <X size={11} className="stroke-[3px]" />
                                          ) : (
                                            <Check size={11} className="stroke-[3px]" />
                                          )}
                                        </button>
  
                                        {editingField.type === "component-name" && editingField.id === cat.id && editingField.subId === comp.id ? (
                                          <input
                                            type="text"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={saveInlineEdit}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                                            autoFocus
                                            className="text-xs font-bold text-slate-900 border-b border-indigo-500 bg-white focus:outline-hidden"
                                          />
                                        ) : (
                                          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                            <span 
                                              onClick={() => startEditing("component-name", cat.id, comp.id, comp.name)}
                                              className={`cursor-pointer hover:text-indigo-600 hover:font-semibold transition-all duration-150 truncate max-w-[130px] sm:max-w-none ${
                                                isExcluded ? "text-slate-400 line-through italic" : "text-slate-800"
                                              }`}
                                              title={`${comp.name} — Click to rename`}
                                            >
                                              {comp.name}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                      {/* Input cell for each vendor column */}
                                  {getCategoryVendors(cat).map((vendor) => {
                                    const rawVal = project.costValues[cat.id]?.[comp.id]?.[vendor.id] ?? 0;
                                    const factor = getComponentScaleFactor(comp.name, comp.id, tcoYears, cat.components);
                                    const scaledVal = rawVal * factor;
                                    
                                    // Calculate average across all vendors for this specific component line item
                                    const compPrices = getCategoryVendors(cat).map(v => (project.costValues[cat.id]?.[comp.id]?.[v.id] ?? 0) * factor);
                                    const pricingSum = compPrices.reduce((a, b) => a + b, 0);
                                    const compAvg = compPrices.length > 0 ? pricingSum / compPrices.length : 0;
                                    
                                    return (
                                      <td key={vendor.id} className={`px-4 py-3 text-right transition-all duration-200 ${project.selectedVendorIds?.[cat.id] === vendor.id ? "bg-emerald-50/45 border-x border-emerald-100" : ""}`}>
                                        <div className={`flex flex-col items-end justify-center ${isExcluded ? "opacity-45" : ""}`}>
                                          <div className="flex items-center justify-end font-mono text-sm antialiased">
                                            <span className={`text-xs font-semibold mr-0.5 select-none ${isExcluded ? "text-slate-350" : "text-slate-400"}`}>
                                              {CURRENCY_SYMBOLS[project.currency] || "$"}
                                            </span>
                                            <input
                                              type="text"
                                              defaultValue={rawVal === 0 ? "0" : rawVal.toString()}
                                              disabled={isExcluded}
                                              key={`${project.id}-${cat.id}-${comp.id}-${vendor.id}-${rawVal}`} // Key forces re-render if reset triggered
                                              onBlur={(e) => handleCellChange(cat.id, comp.id, vendor.id, e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.currentTarget.blur();
                                                }
                                              }}
                                              className={`text-right w-24 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-indigo-50/20 focus:text-slate-900 rounded-sm font-bold antialiased py-0.5 px-1 focus:ring-1 focus:ring-indigo-150 focus:outline-hidden transition-all duration-150 select-all ${
                                                isExcluded ? "text-slate-400 line-through italic cursor-not-allowed" : "text-slate-800"
                                              }`}
                                            />
                                          </div>
                                          {showDualConversion(rawVal)}
 
                                          {/* Scaled TCO indicator for annual/recurring components */}
                                          {isExcluded ? (
                                            <span className="text-[10px] font-bold font-mono mt-0.5 text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 select-none scale-95 italic">
                                              Excluded
                                            </span>
                                          ) : (
                                            factor !== 1 && (
                                              <span className={`text-[10px] font-bold font-mono mt-0.5 select-none ${factor === 0 ? "text-slate-400 italic" : "text-indigo-600 bg-indigo-50/50 px-1 py-0.5 rounded-sm scale-95"}`}>
                                                {factor === 0 ? `Excluded from ${tcoYears}-Yr TCO` : `TCO: ${formatCurrency(scaledVal)} (${factor}x)`}
                                              </span>
                                            )
                                          )}
 
                                          {/* Variance indicator relative to specific row average cost */}
                                          {!isExcluded && getCategoryVendors(cat).length > 1 && compAvg > 0 && (() => {
                                            const diffPercent = ((scaledVal - compAvg) / compAvg) * 100;
                                            if (Math.abs(diffPercent) < 0.1) {
                                              return (
                                                <span className="text-[9px] text-slate-400 font-mono mt-0.5 select-none opacity-50">
                                                  average
                                                </span>
                                              );
                                            }
                                            const isHigher = diffPercent > 0;
                                            return (
                                              <span 
                                                className={`text-[9px] font-mono mt-0.5 select-none flex items-center gap-0.5 ${
                                                  isHigher ? "text-rose-500 font-medium" : "text-emerald-600 font-semibold"
                                                }`}
                                                title={`${isHigher ? "Higher" : "Lower"} than row average by ${Math.abs(diffPercent).toFixed(1)}%`}
                                              >
                                                {isHigher ? "▲" : "▼"} {Math.abs(diffPercent).toFixed(1)}%
                                              </span>
                                            );
                                          })()}
 
                                          {/* Expandable Category & Month-wise Breakdown button under the amount */}
                                          {!isExcluded && comp.name.toLowerCase().includes("annual") && (
                                            <button
                                              type="button"
                                              onClick={() => handleVendorTrackerToggle(cat.id, comp.id, vendor.id)}
                                              className={`mt-1.5 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide transition border flex items-center justify-center gap-1 cursor-pointer select-none print:hidden ${
                                                expandedTrackers[cat.id]?.[comp.id] && (trackerVendorSelections[`${cat.id}-${comp.id}`] || getCategoryVendors(cat)[0]?.id) === vendor.id
                                                  ? "bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600" 
                                                  : "bg-cyan-50/75 hover:bg-cyan-100 text-cyan-700 border-cyan-200 hover:border-cyan-300"
                                              }`}
                                              title={`Open Category & Month-wise Breakdown for ${vendor.name}`}
                                            >
                                              <Calendar size={10} />
                                              Category & Month-wise Breakdown
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
 
                                  {/* Action column delete row/clone row */}
                                  <td className="px-2 text-center text-slate-300 hover:text-rose-500 cursor-pointer transition print:hidden">
                                    <div className="flex items-center justify-center gap-1">
                                      {comp.name.toLowerCase().includes("annual") && (
                                        <button 
                                          onClick={() => cloneCostComponent(cat.id, comp.id, comp.name)}
                                          className="opacity-45 hover:opacity-100 group-hover/row:opacity-100 hover:scale-110 p-1 text-slate-400 hover:text-indigo-600 rounded transition duration-150"
                                          title="Clone/duplicate this annual components series row"
                                        >
                                          <Copy size={13} />
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => deleteCostComponent(cat.id, comp.id, comp.name)}
                                        className="opacity-45 hover:opacity-100 group-hover/row:opacity-100 hover:scale-110 p-1 text-slate-400 hover:text-rose-500 rounded transition duration-150"
                                        title="Delete this row"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {expandedTrackers[cat.id]?.[comp.id] && (
                                  <tr className="bg-slate-50/10 border-b border-cyan-100/50 print:bg-white" key={`${comp.id}-expanded-tracker`}>
                                    <td colSpan={getCategoryVendors(cat).length + 2} className="px-4 py-3 bg-slate-50/15">
                                      <div className="max-w-full overflow-hidden my-1">
                                        <MonthlyCostTrackerComponent 
                                          catId={cat.id} 
                                          compId={comp.id} 
                                          compName={comp.name} 
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                  </React.Fragment>
                                );
                              })}

                              {/* Section Category SUM Total row */}
                              <tr className="bg-slate-50/40 font-bold border-t border-slate-200">
                                <td className="px-4 py-3 text-xs font-extrabold uppercase text-slate-500 tracking-wider">
                                  Total ({cat.name})
                                </td>

                                {getCategoryVendors(cat).map((vendor) => {
                                  const catTotal = getCategoryTotalForVendor(cat.id, vendor.id);
                                  
                                  // Calculate average category totals across all vendors
                                  const totalsList = getCategoryVendors(cat).map(v => getCategoryTotalForVendor(cat.id, v.id));
                                  const totalSum = totalsList.reduce((a, b) => a + b, 0);
                                  const totalAvg = totalsList.length > 0 ? totalSum / totalsList.length : 0;
                                  
                                  return (
                                    <td key={vendor.id} className={`px-4 py-3 text-right font-mono text-sm font-black text-slate-900 border-b-2 border-double border-slate-300 transition-all duration-200 ${project.selectedVendorIds?.[cat.id] === vendor.id ? "bg-emerald-50/60 border-x border-emerald-100" : ""}`}>
                                      <div className="flex flex-col items-end justify-center">
                                        <span>{formatCurrency(catTotal)}</span>
                                        {catTotal > 0 && (() => {
                                          const breakdown = getCategoryTotalBreakdown(cat.id, vendor.id);
                                          return (
                                            <span className="text-[9.5px] text-slate-500 font-sans tracking-tight mt-1 leading-tight text-right block font-semibold">
                                              {formatCurrency(breakdown.oneTime)} <span className="text-slate-400 font-normal">one-time</span> + {formatCurrency(breakdown.recurring)} <span className="text-slate-400 font-normal">recurring</span>
                                            </span>
                                          );
                                        })()}
                                        {showDualConversion(catTotal)}
                                        {getCategoryVendors(cat).length > 1 && totalAvg > 0 && (() => {
                                          const diffPercent = ((catTotal - totalAvg) / totalAvg) * 100;
                                          if (Math.abs(diffPercent) < 0.1) {
                                            return (
                                              <span className="text-[9px] text-slate-400 font-mono select-none font-normal leading-none mt-1 opacity-50">
                                                average
                                              </span>
                                            );
                                          }
                                          const isHigher = diffPercent > 0;
                                          return (
                                            <span 
                                              className={`text-[9px] font-mono select-none leading-none mt-1.5 flex items-center gap-0.5 ${
                                                isHigher ? "text-rose-500 font-bold" : "text-emerald-600 font-black"
                                              }`}
                                              title={`${isHigher ? "Higher" : "Lower"} than category sum average by ${Math.abs(diffPercent).toFixed(1)}%`}
                                            >
                                              {isHigher ? "▲" : "▼"} {Math.abs(diffPercent).toFixed(1)}%
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="print:hidden"></td>
                              </tr>

                              {/* Vendor specific attachments row */}
                              <tr className="bg-slate-50/20 text-xs border-t border-slate-100 print:hidden font-medium">
                                <td className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px] select-none">
                                  <div className="flex items-center gap-1.5 text-slate-500">
                                    <Paperclip size={12} className="text-indigo-500" />
                                    Linked Attachments
                                  </div>
                                </td>
                                {getCategoryVendors(cat).map((vendor) => {
                                  const vendorFiles = getFilesForVendor(vendor.id);
                                  return (
                                    <td key={vendor.id} className={`px-4 py-3 text-right transition-all duration-200 ${project.selectedVendorIds?.[cat.id] === vendor.id ? "bg-emerald-50/45 border-x border-emerald-100" : ""}`}>
                                      <div className="flex flex-col items-end gap-1.5 justify-start">
                                        {vendorFiles.length > 0 ? (
                                          <div className="flex flex-col gap-1 w-full max-w-[200px] text-[10px]">
                                            {vendorFiles.map((file) => (
                                              <div 
                                                key={file.id} 
                                                className="flex items-center justify-between border border-indigo-100/60 bg-white hover:bg-indigo-50/30 rounded-md px-1.5 py-0.5 font-medium transition duration-150 gap-1.5 shadow-2xs"
                                                title={file.name}
                                              >
                                                <span className="truncate flex-1 select-none font-mono text-[9px] text-slate-705 text-left">
                                                  {file.name}
                                                </span>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                  <button
                                                    type="button"
                                                    onClick={() => setActiveViewFile(file)}
                                                    className="p-0.5 hover:bg-indigo-50 hover:text-indigo-600 text-indigo-500 rounded cursor-pointer"
                                                    title="Quick View"
                                                  >
                                                    <Eye size={10} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => downloadFile(file)}
                                                    className="p-0.5 hover:bg-slate-100 text-slate-500 rounded cursor-pointer"
                                                    title="Download"
                                                  >
                                                    <Download size={10} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => deleteUploadedFile(file.id)}
                                                    className="p-0.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded cursor-pointer"
                                                    title="Remove Link"
                                                  >
                                                    <X size={10} />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 italic mb-0.5 select-none font-normal">No files active</span>
                                        )}

                                        {/* Upload attachment button */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const input = document.createElement("input");
                                            input.type = "file";
                                            input.multiple = true;
                                            input.onchange = (ev) => handleVendorFileUpload(vendor.id, ev as any);
                                            input.click();
                                          }}
                                          className="inline-flex items-center gap-1 font-bold text-[9px] text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 rounded px-1.5 py-0.5 transition cursor-pointer"
                                        >
                                          <Plus size={10} className="stroke-[2.5]" /> Attach File
                                        </button>
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="print:hidden"></td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead>
                              <tr className="bg-slate-50/70 rounded-lg print:bg-slate-50">
                                <th scope="col" className="px-4 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/4">
                                  Vendor ID / Name
                                </th>
                                {cat.components.map((comp, compIdx) => {
                                  const isExcluded = isComponentExcluded(cat.id, comp.id);
                                  return (
                                    <th 
                                      key={comp.id} 
                                      scope="col" 
                                      className={`px-4 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-widest relative group/vhead transition ${
                                        draggedComponentInfo?.catId === cat.id && draggedComponentInfo?.compIndex === compIdx 
                                          ? "opacity-35 bg-indigo-50/30 ring-1 ring-indigo-450" 
                                          : ""
                                      } ${isExcluded ? "bg-slate-100/40" : ""}`}
                                      onDragOver={(e) => handleComponentDragOver(e)}
                                      onDrop={(e) => handleComponentDrop(e, cat.id, compIdx)}
                                    >
                                      <div className="flex items-center justify-end gap-1.5 group">
                                        {/* Drag Handle for Component Column */}
                                        <div
                                          draggable
                                          onDragStart={(e) => handleComponentDragStart(e, cat.id, compIdx)}
                                          className="p-0.5 cursor-grab text-slate-300 hover:text-indigo-600 hover:bg-slate-50/50 rounded opacity-0 group-hover/vhead:opacity-100 transition duration-150 print:hidden shrink-0 flex items-center justify-center"
                                          title="Drag to reorder component column"
                                        >
                                          <GripVertical size={12} />
                                        </div>

                                        {/* Transposed Component include/exclude toggle */}
                                        <button
                                          onClick={() => toggleCostComponentIncluded(cat.id, comp.id)}
                                          className={`p-1 rounded transition duration-150 print:hidden shrink-0 flex items-center justify-center cursor-pointer ${
                                            isExcluded
                                              ? "text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 bg-slate-100/60 font-black"
                                              : "text-emerald-600 hover:text-rose-600 hover:bg-rose-50 bg-emerald-50/30 font-black"
                                          }`}
                                          title={isExcluded ? "Currently excluded. Click to include in TCO totals" : "Currently included. Click to exclude from TCO totals"}
                                        >
                                          {isExcluded ? (
                                            <X size={10} className="stroke-[3px]" />
                                          ) : (
                                            <Check size={10} className="stroke-[3px]" />
                                          )}
                                        </button>
  
                                        {editingField.type === "component-name" && editingField.id === cat.id && editingField.subId === comp.id ? (
                                          <input
                                            type="text"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={saveInlineEdit}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                                            autoFocus
                                            className="text-right font-extrabold text-slate-900 border-b border-indigo-500 text-xs py-0.5 focus:outline-hidden w-24 bg-white"
                                          />
                                        ) : (
                                          <span
                                            onClick={() => startEditing("component-name", cat.id, comp.id, comp.name)}
                                            className={`cursor-pointer hover:text-indigo-600 select-all border-b border-transparent hover:border-slate-300 font-extrabold mr-2 duration-150 transition-all ${
                                              isExcluded ? "text-slate-400 line-through italic" : "text-slate-900"
                                            }`}
                                            title="Click to rename component column"
                                          >
                                            {comp.name}
                                          </span>
                                        )}
  
                                        {/* Clone button for annual components in transposed layout */}
                                        {comp.name.toLowerCase().includes("annual") && (
                                          <button 
                                            onClick={() => cloneCostComponent(cat.id, comp.id, comp.name)}
                                            className="text-slate-400 hover:text-indigo-600 rounded p-1 transition print:hidden shrink-0 flex items-center justify-center cursor-pointer"
                                            title={`Clone/duplicate "${comp.name}" series column`}
                                          >
                                            <Copy size={11} />
                                          </button>
                                        )}

                                        {/* Inline Component Delete Button */}
                                        <button 
                                          onClick={() => deleteCostComponent(cat.id, comp.id, comp.name)} 
                                          className="text-slate-400 hover:text-rose-500 rounded p-1 transition print:hidden ml-1 shrink-0"
                                          title={`Remove ${comp.name} from category`}
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    </th>
                                  );
                                })}
                                <th scope="col" className="px-4 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  Total ({cat.name})
                                </th>
                                <th scope="col" className="w-[40px] px-2 text-center text-xs font-bold text-slate-400 print:hidden"></th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-150 bg-white">
                              {getCategoryVendors(cat).map((vendor) => {
                                const catTotal = getCategoryTotalForVendor(cat.id, vendor.id);

                                // Calculated values or averages for the last row totals
                                const totalsList = getCategoryVendors(cat).map(v => getCategoryTotalForVendor(cat.id, v.id));
                                const totalSum = totalsList.reduce((a, b) => a + b, 0);
                                const totalAvg = totalsList.length > 0 ? totalSum / totalsList.length : 0;

                                const isSelected = project.selectedVendorIds?.[cat.id] === vendor.id;
                                return (
                                  <tr key={vendor.id} className={`group/row transition-all duration-200 ${isSelected ? "bg-emerald-50/45 hover:bg-emerald-100/30" : "hover:bg-slate-50/50"}`}>
                                    {/* Vendor label */}
                                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                                      {editingField.type === "vendor-name" && editingField.id === vendor.id && editingField.catId === cat.id ? (
                                        <div className="flex items-center gap-1 select-none">
                                          <input
                                            type="text"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => { 
                                              if (e.key === "Enter") { saveInlineEdit(); }
                                              if (e.key === "Escape") { setEditingField({ type: null }); }
                                            }}
                                            autoFocus
                                            className="text-xs font-bold text-slate-900 border-b border-indigo-500 bg-white focus:outline-hidden"
                                          />
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                                            title="Save"
                                          >
                                            <Check size={11} className="stroke-[3]" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                                            className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                                            title="Cancel"
                                          >
                                            <X size={11} className="stroke-[3]" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-2">
                                            <span 
                                              onClick={() => startEditing("vendor-name", vendor.id, undefined, vendor.name, cat.id)}
                                              className="cursor-pointer hover:text-indigo-600 hover:font-semibold text-xs font-bold text-slate-900"
                                              title="Click to rename vendor"
                                            >
                                              {vendor.name}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleSelectVendor(cat.id, vendor.id)}
                                              className={`px-1.5 py-0.5 text-[8px] rounded-full font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-0.5 inline-flex ${
                                                isSelected 
                                                  ? "bg-emerald-600 text-white border border-emerald-650 shadow-3xs" 
                                                  : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                                              }`}
                                              title={isSelected ? "Unselect vendor" : "Select this vendor"}
                                            >
                                              <Check size={8} className={isSelected ? "stroke-[3]" : "opacity-50"} />
                                              {isSelected ? "Selected" : "Select"}
                                            </button>
                                          </div>

                                          {/* Transposed row attachments block */}
                                          <div className="flex flex-col gap-1 mt-1 print:hidden select-text">
                                            {(() => {
                                              const vendorFiles = getFilesForVendor(vendor.id);
                                              return (
                                                <>
                                                  {vendorFiles.length > 0 && (
                                                    <div className="flex flex-col gap-1 max-w-[170px]">
                                                      {vendorFiles.map((file) => (
                                                        <div 
                                                          key={file.id} 
                                                          className="flex items-center justify-between border border-indigo-100/60 bg-white hover:bg-indigo-50/20 rounded px-1.5 py-0.5 text-[9px] font-medium transition"
                                                          title={file.name}
                                                        >
                                                          <span className="truncate flex-1 select-none font-mono text-[8.5px] text-slate-600 text-left">
                                                            {file.name}
                                                          </span>
                                                          <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                                            <button
                                                              type="button"
                                                              onClick={(ev) => { ev.stopPropagation(); setActiveViewFile(file); }}
                                                              className="p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-slate-100 rounded cursor-pointer"
                                                              title="View"
                                                            >
                                                              <Eye size={9} />
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={(ev) => { ev.stopPropagation(); downloadFile(file); }}
                                                              className="p-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                                                              title="Download"
                                                            >
                                                              <Download size={9} />
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={(ev) => { ev.stopPropagation(); deleteUploadedFile(file.id); }}
                                                              className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"
                                                              title="Remove link"
                                                            >
                                                              <X size={9} />
                                                            </button>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}

                                                  <button
                                                    type="button"
                                                    onClick={(ev) => {
                                                      ev.stopPropagation();
                                                      const input = document.createElement("input");
                                                      input.type = "file";
                                                      input.multiple = true;
                                                      input.onchange = (ev2) => handleVendorFileUpload(vendor.id, ev2 as any);
                                                      input.click();
                                                    }}
                                                    className="inline-flex items-center gap-1 font-bold text-[8.5px] text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 rounded px-1 py-0.5 transition w-fit cursor-pointer"
                                                  >
                                                    <Plus size={9} className="stroke-[2.5]" /> Attach File
                                                  </button>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      )}
                                    </td>

                                    {/* Component value cells */}
                                    {cat.components.map((comp) => {
                                      const isExcluded = isComponentExcluded(cat.id, comp.id);
                                      const rawVal = project.costValues[cat.id]?.[comp.id]?.[vendor.id] ?? 0;
                                      const factor = getComponentScaleFactor(comp.name, comp.id, tcoYears, cat.components);
                                      const scaledVal = rawVal * factor;

                                      // Calculate average for this component column across all vendors
                                      const compPrices = getCategoryVendors(cat).map(v => (project.costValues[cat.id]?.[comp.id]?.[v.id] ?? 0) * factor);
                                      const pricingSum = compPrices.reduce((a, b) => a + b, 0);
                                      const compAvg = compPrices.length > 0 ? pricingSum / compPrices.length : 0;

                                      return (
                                        <td key={comp.id} className="px-4 py-3 text-right">
                                          <div className={`flex flex-col items-end justify-center ${isExcluded ? "opacity-45" : ""}`}>
                                            <div className="flex items-center justify-end font-mono text-sm antialiased text-slate-800">
                                              <span className={`text-xs font-semibold mr-0.5 select-none font-sans ${isExcluded ? "text-slate-350" : "text-slate-400"}`}>
                                                {CURRENCY_SYMBOLS[project.currency] || "$"}
                                              </span>
                                              <input
                                                type="text"
                                                defaultValue={rawVal === 0 ? "0" : rawVal.toString()}
                                                disabled={isExcluded}
                                                key={`${project.id}-${cat.id}-${comp.id}-${vendor.id}-${rawVal}`}
                                                onBlur={(e) => handleCellChange(cat.id, comp.id, vendor.id, e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.currentTarget.blur();
                                                  }
                                                }}
                                                className={`text-right w-24 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-indigo-50/20 focus:text-slate-900 rounded-sm font-bold antialiased py-0.5 px-1 focus:ring-1 focus:ring-indigo-150 focus:outline-hidden transition-all duration-150 select-all ${
                                                  isExcluded ? "text-slate-400 line-through italic cursor-not-allowed" : "text-slate-800"
                                                }`}
                                              />
                                            </div>
                                            {showDualConversion(rawVal)}

                                            {/* Scaled TCO indicator for annual/recurring components */}
                                            {isExcluded ? (
                                              <span className="text-[10px] font-bold font-mono mt-0.5 text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 select-none scale-95 italic">
                                                Excluded
                                              </span>
                                            ) : (
                                              factor !== 1 && (
                                                <span className={`text-[10px] font-bold font-mono mt-0.5 select-none ${factor === 0 ? "text-slate-400 italic" : "text-indigo-600 bg-indigo-50/50 px-1 py-0.5 rounded-sm scale-95"}`}>
                                                  {factor === 0 ? `Excluded` : `TCO: ${formatCurrency(scaledVal)}`}
                                                </span>
                                              )
                                            )}

                                            {/* Variance indicator relative to column average */}
                                            {!isExcluded && getCategoryVendors(cat).length > 1 && compAvg > 0 && (() => {
                                              const diffPercent = ((scaledVal - compAvg) / compAvg) * 100;
                                              if (Math.abs(diffPercent) < 0.1) {
                                                return (
                                                  <span className="text-[9px] text-slate-400 font-mono mt-0.5 select-none opacity-50">
                                                    average
                                                  </span>
                                                );
                                              }
                                              const isHigher = diffPercent > 0;
                                              return (
                                                <span 
                                                  className={`text-[9px] font-mono mt-0.5 select-none flex items-center gap-0.5 ${
                                                    isHigher ? "text-rose-500 font-medium" : "text-emerald-600 font-semibold"
                                                  }`}
                                                  title={`${isHigher ? "Higher" : "Lower"} than component average by ${Math.abs(diffPercent).toFixed(1)}%`}
                                                >
                                                  {isHigher ? "▲" : "▼"} {Math.abs(diffPercent).toFixed(1)}%
                                                </span>
                                              );
                                            })()}

                                            {/* Expandable Category & Month-wise Breakdown button under the amount block inside transposed layout */}
                                            {!isExcluded && comp.name.toLowerCase().includes("annual") && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setTrackerVendorSelections(prev => ({
                                                    ...prev,
                                                    [`${cat.id}-${comp.id}`]: vendor.id
                                                  }));
                                                  setModalTrackerInfo({ catId: cat.id, compId: comp.id, compName: comp.name });
                                                }}
                                                className="mt-1.5 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide transition border flex items-center justify-center gap-1 cursor-pointer select-none print:hidden bg-cyan-50/75 hover:bg-cyan-100 text-cyan-700 border-cyan-200 hover:border-cyan-300"
                                                title={`Open Category & Month-wise Breakdown for ${vendor.name}`}
                                              >
                                                <Calendar size={10} />
                                                Category & Month-wise Breakdown
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}

                                    {/* Row Total */}
                                    <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-900 border-b-2 border-double border-slate-300">
                                      <div className="flex flex-col items-end justify-center">
                                        <span>{formatCurrency(catTotal)}</span>
                                        {catTotal > 0 && (() => {
                                          const breakdown = getCategoryTotalBreakdown(cat.id, vendor.id);
                                          return (
                                            <span className="text-[9.5px] text-slate-500 font-sans tracking-tight mt-1 leading-tight text-right block font-semibold">
                                              {formatCurrency(breakdown.oneTime)} <span className="text-slate-400 font-normal">one-time</span> + {formatCurrency(breakdown.recurring)} <span className="text-slate-400 font-normal">recurring</span>
                                            </span>
                                          );
                                        })()}
                                        {showDualConversion(catTotal)}
                                        {getCategoryVendors(cat).length > 1 && totalAvg > 0 && (() => {
                                          const diffPercent = ((catTotal - totalAvg) / totalAvg) * 100;
                                          if (Math.abs(diffPercent) < 0.1) {
                                            return (
                                              <span className="text-[9px] text-slate-400 font-mono select-none font-normal leading-none mt-0.5 opacity-50">
                                                average
                                              </span>
                                            );
                                          }
                                          const isHigher = diffPercent > 0;
                                          return (
                                            <span 
                                              className={`text-[9px] font-mono select-none leading-none mt-1 flex items-center gap-0.5 ${
                                                isHigher ? "text-rose-500 font-bold" : "text-emerald-600 font-black"
                                              }`}
                                              title={`${isHigher ? "Higher" : "Lower"} than category sum average by ${Math.abs(diffPercent).toFixed(1)}%`}
                                            >
                                              {isHigher ? "▲" : "▼"} {Math.abs(diffPercent).toFixed(1)}%
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>

                                    {/* Action column to delete vendor */}
                                    <td className="px-2 text-center text-slate-300 hover:text-rose-500 cursor-pointer transition print:hidden">
                                      <button 
                                        onClick={() => deleteVendor(vendor.id, vendor.name, cat.id)}
                                        className="opacity-45 hover:opacity-100 group-hover/row:opacity-100 hover:scale-110 p-1 text-slate-400 hover:text-rose-500 rounded transition duration-150"
                                        title={`Remove ${vendor.name} globally`}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}


                              {/* Bottom of transposed table - bottom row is removed per request */}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Actions directly under each category table */}
                    <div className="flex items-center gap-4 mt-3 print:hidden select-none">
                      <button
                        type="button"
                        onClick={() => addCostComponent(cat.id)}
                        className="text-xs font-bold text-indigo-650 hover:text-indigo-800 hover:bg-indigo-50/50 border border-indigo-150 rounded-lg px-3 py-1.5 flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                        title="Add custom cost component row for this category table"
                      >
                        <Plus size={13} className="stroke-[2.5]" /> Add Component Cost Row
                      </button>

                      <button
                        type="button"
                        onClick={() => addNewVendor(cat.id)}
                        className="text-xs font-bold text-slate-650 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                        title="Add new vendor column to comparison"
                      >
                        <Plus size={13} /> Add Vendor Column
                      </button>
                    </div>

                    {/* Category-level Financial Value Pick banner */}
                    {(() => {
                      const validVendorsWithTotals = getCategoryVendors(cat)
                        .map(v => {
                          const catTotalVal = getCategoryTotalForVendor(cat.id, v.id);
                          return { vendor: v, total: catTotalVal };
                        })
                        .filter(v => v.total > 0);

                      if (validVendorsWithTotals.length === 0) return null;

                      // Find the lowest total
                      validVendorsWithTotals.sort((a, b) => a.total - b.total);
                      const bestPick = validVendorsWithTotals[0];
                      const isTiedOrOnlyOne = validVendorsWithTotals.length <= 1;
                      const nextBest = !isTiedOrOnlyOne ? validVendorsWithTotals[1] : null;
                      const savings = nextBest ? nextBest.total - bestPick.total : 0;

                      return (
                        <div className="mt-4 p-4 rounded-xl border border-emerald-100 bg-emerald-50/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
                          <div className="flex items-center gap-2.5">
                            <div className="bg-emerald-600 text-white p-1 rounded-md shrink-0 flex items-center justify-center">
                              <Award size={14} className="stroke-[2.5]" />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                              <span className="text-xs font-black text-slate-900">
                                Financial Value Pick for {cat.name}:
                              </span>
                              <span className="text-xs font-extrabold text-emerald-800">
                                {bestPick.vendor.name} ({formatCurrency(bestPick.total)})
                              </span>
                              {showDualConversion(bestPick.total, "text-[10px] font-mono text-emerald-600 font-bold sm:ml-1")}
                            </div>
                          </div>
                          {savings > 0 && (
                            <div className="text-[10.5px] font-bold text-emerald-700 bg-emerald-100/60 px-2.5 py-1 rounded-md shrink-0 self-start sm:self-center">
                              ✨ Saves {formatCurrency(savings)} compared to {nextBest?.vendor.name}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Category-Specific Supplying Parameters & Qualitative Milestones */}
                    {project.deletedCategoryQualitativeSections?.[cat.id] ? (
                      <div className="border border-dashed border-[#bfe2ea] bg-cyan-50/10 rounded-2xl p-4 flex sm:flex-row flex-col items-center justify-between gap-3 mt-5 print:hidden">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-[#0e7490] shrink-0 animate-pulse" />
                          <span className="text-xs font-semibold text-slate-500">
                            Supplying Parameters & Qualitative Milestones section has been deleted/hidden for the "{cat.name}" category.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...project };
                            if (!updated.deletedCategoryQualitativeSections) {
                              updated.deletedCategoryQualitativeSections = {};
                            }
                            updated.deletedCategoryQualitativeSections[cat.id] = false;
                            updateCurrentProject(updated);
                            showToast("Qualitative section restored.");
                          }}
                          className="px-2.5 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-[10.5px] font-extrabold text-cyan-700 rounded-lg cursor-pointer transition select-none"
                        >
                          Restore Section
                        </button>
                      </div>
                    ) : (
                      <div className="border border-cyan-100/70 bg-cyan-50/15 rounded-2xl p-4 sm:p-6 flex flex-col gap-4 mt-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h5 className="text-xs font-black text-[#0e7490] uppercase tracking-wider flex items-center gap-1.5">
                              <FileText size={13} className="text-[#0e7490]" /> Supplying Parameters & Qualitative Milestones
                            </h5>
                            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Define license configurations, payment schedules, and timeline conditions specifically for the {cat.name} category.</p>
                          </div>
                          <div className="flex items-center gap-2 print:hidden shrink-0 self-start sm:self-center">
                            <button
                              type="button"
                              onClick={() => addCategoryQualitativeRow(cat.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-bold rounded-lg transition shadow-3xs cursor-pointer select-none"
                              title="Add custom qualitative parameter row for this category"
                            >
                              <Plus size={11} className="stroke-[2.5]" /> Add Category Row
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDialog({
                                  title: "Delete Qualitative Section",
                                  message: `Are you sure you want to delete the Qualitative Parameters section for "${cat.name}"? This hides it from view and the print layout.`,
                                  onConfirm: () => {
                                    const updated = { ...project };
                                    if (!updated.deletedCategoryQualitativeSections) {
                                      updated.deletedCategoryQualitativeSections = {};
                                    }
                                    updated.deletedCategoryQualitativeSections[cat.id] = true;
                                    updateCurrentProject(updated);
                                    showToast("Qualitative section deleted.");
                                  }
                                });
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold rounded-lg transition shadow-3xs cursor-pointer select-none"
                              title="Delete/Hide this section entirely"
                            >
                              <Trash2 size={11} /> Delete Section
                            </button>
                          </div>
                        </div>

                      <div className="overflow-x-auto rounded-xl border border-cyan-100/80 bg-white shadow-3xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#e4f3f6] border-b border-[#bfe2ea] text-slate-850 font-extrabold tracking-wide">
                              <th className="px-4 py-2.5 w-64 uppercase text-[#0e7490] select-none text-[10px]">Qualitative Parameter</th>
                              {getCategoryVendors(cat).map((v) => {
                                const isSelected = project.selectedVendorIds?.[cat.id] === v.id;
                                return (
                                  <th key={v.id} className={`px-4 py-2.5 text-slate-800 text-[10.5px] relative group/vhead transition-all duration-200 ${isSelected ? "bg-emerald-50/70 border-x border-emerald-100" : ""}`}>
                                    {editingField.type === "vendor-name" && editingField.id === v.id && editingField.catId === cat.id ? (
                                      <div className="flex items-center gap-1 select-none justify-start">
                                        <input
                                          type="text"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyDown={(e) => { 
                                            if (e.key === "Enter") { saveInlineEdit(); }
                                            if (e.key === "Escape") { setEditingField({ type: null }); }
                                          }}
                                          autoFocus
                                          className="bg-white border-b border-indigo-500 font-extrabold text-slate-900 text-xs py-0.5 focus:outline-hidden w-24 bg-white text-left"
                                        />
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                                          title="Save"
                                        >
                                          <Check size={11} className="stroke-[3]" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                                          className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                                          title="Cancel"
                                        >
                                          <X size={11} className="stroke-[3]" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span
                                        onClick={() => startEditing("vendor-name", v.id, undefined, v.name, cat.id)}
                                        className="cursor-pointer hover:text-indigo-600 border-b border-transparent hover:border-slate-350 select-all font-extrabold text-slate-900"
                                        title="Click to rename vendor"
                                      >
                                        {v.name}
                                      </span>
                                    )}
                                  </th>
                                );
                              })}
                              <th className="px-4 py-2.5 text-center text-[#0e7490] w-20 print:hidden text-[10px] uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {getCategoryQualitativeRows(project, cat.id).map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50/50 transition">
                                <td className="px-4 py-3 text-xs font-bold text-slate-705">
                                  <input
                                    type="text"
                                    value={row.name}
                                    onChange={(e) => handleCategoryQualitativeRowHeaderChange(cat.id, row.id, "name", e.target.value)}
                                    className="w-full text-xs font-extrabold text-[#0369a1] bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#0369a1] px-1 py-0.5 rounded transition focus:outline-hidden"
                                    placeholder="Parameter Title (e.g. SLA Terms)"
                                  />
                                  <textarea
                                    rows={2}
                                    value={row.description}
                                    onChange={(e) => handleCategoryQualitativeRowHeaderChange(cat.id, row.id, "description", e.target.value)}
                                    className="w-full text-[10px] text-slate-400 font-medium block mt-1 leading-normal bg-transparent border border-transparent hover:border-slate-200 focus:border-[#0369a1] px-1 py-0.5 rounded transition focus:outline-hidden resize-none"
                                    placeholder="Describe parameter criteria..."
                                  />
                                </td>
                                {getCategoryVendors(cat).map((v) => {
                                  const value = row.values?.[v.id] ?? "";
                                  return (
                                    <td key={v.id} className={`px-4 py-3 transition-all duration-200 ${project.selectedVendorIds?.[cat.id] === v.id ? "bg-emerald-50/45 border-x border-emerald-100" : ""}`}>
                                      <div className="relative group/field flex flex-col items-stretch">
                                        <textarea
                                          rows={2}
                                          placeholder="Describe details..."
                                          value={value}
                                          onChange={(e) => handleCategoryQualitativeRowValueChange(cat.id, row.id, v.id, e.target.value)}
                                          className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl p-2.5 resize-y leading-relaxed text-left font-sans transition-all"
                                        />
                                        {value && (
                                          <button
                                            onClick={() => {
                                              setConfirmDialog({
                                                title: "Clear Parameter Value",
                                                message: `Are you sure you want to delete the details for ${v.name}?`,
                                                onConfirm: () => handleCategoryQualitativeRowValueChange(cat.id, row.id, v.id, "")
                                              });
                                            }}
                                            className="absolute top-1.5 right-1.5 opacity-0 group-hover/field:opacity-100 p-1 text-slate-400 hover:text-rose-500 bg-white shadow-xs rounded-md border border-slate-150 transition cursor-pointer"
                                            title="Clear value"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                
                                {/* Actions Column */}
                                <td className="px-4 py-3 text-center print:hidden border-l border-slate-50">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => cloneCategoryQualitativeRow(cat.id, row.id)}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition cursor-pointer"
                                      title="Clone row"
                                    >
                                      <Copy size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteCategoryQualitativeRow(cat.id, row.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition cursor-pointer"
                                      title="Delete row"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    )}

                    {/* Quick helper controls at table footer context */}
                    <div className="flex items-center gap-4 mt-1 border-t border-slate-100 pt-4 print:hidden">
                      <button
                        onClick={() => addCostComponent(cat.id)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-slate-50 border border-transparent rounded-lg px-3 py-1.5 flex items-center gap-1 cursor-pointer transition"
                      >
                        <Plus size={14} className="stroke-[2.5]" /> Add Component Cost Row
                      </button>

                      <button
                        onClick={() => addNewVendor(cat.id)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-transparent rounded-lg px-3 py-1.5 flex items-center gap-1 cursor-pointer transition"
                      >
                        <Plus size={14} /> Add Vendor Column
                      </button>
                    </div>

                  </div>

                </div>
              );
            })}

            {/* QUALITATIVE PARAMETERS MATRIX (Plan, Milestones, Onboarding) */}
            {project.deletedProjectQualitativeSection ? (
              <div className="border border-dashed border-[#c0e6ee] bg-[#f0f9fa]/20 rounded-3xl p-6 flex sm:flex-row flex-col items-center justify-between gap-4 mt-4 print:hidden">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-[#0e7490] shrink-0 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-500">
                    Project-level Supplying Parameters & Qualitative Milestones section has been deleted/hidden.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { ...project };
                    updated.deletedProjectQualitativeSection = false;
                    updateCurrentProject(updated);
                    showToast("Qualitative section restored.");
                  }}
                  className="px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-xs font-bold text-cyan-700 rounded-lg cursor-pointer transition select-none"
                >
                  Restore Section
                </button>
              </div>
            ) : (
              <div className="border border-[#c0e6ee] rounded-3xl bg-[#f0f9fa]/50 backdrop-blur-md shadow-sm overflow-hidden mt-4 p-6 md:p-8 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-extrabold text-[#0e7490] uppercase tracking-widest flex items-center gap-2">
                      <FileText size={14} className="text-[#0e7490]" /> Supplying Parameters & Qualitative Milestones
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">Provide license specifics, incremental payout installments, and transition expectations for each tender supplier.</p>
                  </div>
                  <div className="flex items-center gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={addQualitativeRow}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer select-none"
                      title="Add custom qualitative parameter row to compare vendors"
                    >
                      <Plus size={13} /> Add Qualitative Row
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDialog({
                          title: "Delete Qualitative Section",
                          message: "Are you sure you want to delete the Project-level Qualitative Parameters section? This will hide it from the viewport and the print layout.",
                          onConfirm: () => {
                            const updated = { ...project };
                            updated.deletedProjectQualitativeSection = true;
                            updateCurrentProject(updated);
                            showToast("Qualitative section deleted.");
                          }
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-lg transition shadow-xs cursor-pointer select-none"
                      title="Delete/Hide this section entirely"
                    >
                      <Trash2 size={13} /> Delete Section
                    </button>
                  </div>
                </div>

              <div className="overflow-x-auto rounded-2xl border border-[#bfe2ea] bg-white shadow-3xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#e4f3f6] border-b border-[#bfe2ea] text-slate-800 text-[11px] font-bold tracking-wider">
                      <th className="px-5 py-3.5 w-76 font-extrabold uppercase text-[#0e7490] select-none">Qualitative Parameter</th>
                      {project.vendors.map((v) => (
                        <th key={v.id} className="px-5 py-3.5 font-extrabold uppercase text-slate-800 min-w-[250px]">
                          {editingField.type === "vendor-name" && editingField.id === v.id ? (
                            <div className="flex items-center gap-1 select-none">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => { 
                                  if (e.key === "Enter") { saveInlineEdit(); }
                                  if (e.key === "Escape") { setEditingField({ type: null }); }
                                }}
                                autoFocus
                                className="bg-white border-b border-indigo-500 font-extrabold text-slate-900 text-xs py-0.5 focus:outline-hidden w-28 bg-white"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                                title="Save"
                              >
                                <Check size={11} className="stroke-[3]" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                                title="Cancel"
                              >
                                <X size={11} className="stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <span 
                              onClick={() => startEditing("vendor-name", v.id, undefined, v.name)}
                              className="cursor-pointer hover:text-indigo-600 border-b border-transparent hover:border-slate-350"
                              title="Click to rename vendor"
                            >
                              {v.name}
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="px-5 py-3.5 text-center font-extrabold uppercase text-[#0e7490] w-24 print:hidden">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {getProjectQualitativeRows(project).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-5 py-4 text-xs font-bold text-slate-705">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => handleQualitativeRowHeaderChange(row.id, "name", e.target.value)}
                            className="w-full text-xs font-extrabold text-[#0369a1] bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#0369a1] px-1 py-0.5 rounded transition focus:outline-hidden"
                            placeholder="Parameter Title (e.g. SLA Terms)"
                          />
                          <textarea
                            rows={2}
                            value={row.description}
                            onChange={(e) => handleQualitativeRowHeaderChange(row.id, "description", e.target.value)}
                            className="w-full text-[10px] text-slate-400 font-medium block mt-1 leading-normal bg-transparent border border-transparent hover:border-slate-305 focus:border-[#0369a1] px-1 py-0.5 rounded transition focus:outline-hidden resize-none"
                            placeholder="Describe parameter criteria..."
                          />
                        </td>
                        {project.vendors.map((v) => {
                          const value = row.values?.[v.id] ?? "";
                          return (
                            <td key={v.id} className="px-5 py-4">
                              <div className="relative group/field flex flex-col items-stretch">
                                <textarea
                                  rows={3}
                                  placeholder="Describe details..."
                                  value={value}
                                  onChange={(e) => handleQualitativeRowValueChange(row.id, v.id, e.target.value)}
                                  className="w-full text-xs bg-slate-50 border border-slate-250 focus:bg-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl p-3 resize-y leading-relaxed text-left font-sans transition-all"
                                />
                                {value && (
                                  <button
                                    onClick={() => {
                                      setConfirmDialog({
                                        title: "Clear Parameter Value",
                                        message: `Are you sure you want to delete the details for ${v.name}?`,
                                        onConfirm: () => handleQualitativeRowValueChange(row.id, v.id, "")
                                      });
                                    }}
                                    className="absolute top-2 right-2 opacity-0 group-hover/field:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 bg-white shadow-xs rounded-lg border border-slate-150 transition cursor-pointer"
                                    title="Clear value"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        
                        {/* Actions Column */}
                        <td className="px-5 py-4 text-center print:hidden border-l border-slate-50">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => cloneQualitativeRow(row.id)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title={`Clone/Duplicate row "${row.name}"`}
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteQualitativeRow(row.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title={`Delete row "${row.name}"`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        </section>



        {/* CORE SECTION 3: GRAND TOTALS 2-YEAR TCO (OCR ACCORDANCE) */}
        <section className="bg-[#f0f9fa] backdrop-blur-xl text-slate-800 rounded-2xl border border-[#c0e6ee] shadow-2xl overflow-hidden print:bg-white print:text-slate-900 print:border-slate-300 print:shadow-none print:rounded-none">
          
          {/* Header block */}
          <div className="bg-[#e0f1f4]/60 backdrop-blur-md p-6 md:px-8 py-5 border-b border-[#c0e6ee]/65 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:bg-transparent print:border-slate-200">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#0e7490]">Section 3 Summaries</span>
              <h3 className="text-base font-bold text-slate-950 tracking-tight flex items-center gap-2 mt-0.5 print:text-slate-900">
                Grand Total — {tcoYears} Year TCO
              </h3>
              <p className="text-xs text-slate-650 mt-1 print:text-slate-500">Consolidated financial overview of all cost categories across evaluated options.</p>
            </div>
            
            <span className="text-[10px] font-bold tracking-widest text-[#0c4a6e] uppercase bg-[#e0f2fe] border border-[#bae6fd]/50 px-3 py-1.5 rounded-md print:hidden">
              Consolidated Report
            </span>
          </div>

          <div className="p-6 md:p-8">
            <div className="overflow-x-auto w-full -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="min-w-full divide-y divide-[#c0e6ee] print:divide-slate-200">
                <thead>
                  <tr>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">
                      Selected Vendor Name
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#c0e6ee]/75 bg-[#fcfefef0] print:divide-slate-200 print:bg-white">
                  
                  {project.categories.map((cat) => {
                    const selectedVendorId = project.selectedVendorIds?.[cat.id];
                    const selectedVendor = selectedVendorId
                      ? (getCategoryVendors(cat).find(v => v.id === selectedVendorId) || project.vendors.find(v => v.id === selectedVendorId))
                      : null;
                    
                    const breakdown = selectedVendorId 
                      ? getCategoryTotalBreakdown(cat.id, selectedVendorId)
                      : { oneTime: 0, recurring: 0 };
                    const total = breakdown.oneTime + breakdown.recurring;

                    const recurringLabel = tcoYears === 1 ? "Year 1 Annual Fee" : `${tcoYears} Year TCO Recurring`;

                    return (
                      <tr key={cat.id} className="hover:bg-[#e0f2f5]/30 transition print:hover:bg-transparent">
                        {/* Col 1: Category Name (Editable) */}
                        <td className="px-4 py-4 text-sm font-semibold text-slate-700 print:text-slate-800">
                          {editingField.type === "category-name" && editingField.id === cat.id ? (
                            <div className="flex items-center gap-1 select-none">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => { 
                                  if (e.key === "Enter") { saveInlineEdit(); }
                                  if (e.key === "Escape") { setEditingField({ type: null }); }
                                }}
                                autoFocus
                                className="font-bold text-slate-900 border-b border-indigo-500 text-sm py-0.5 focus:outline-hidden w-full max-w-[200px] bg-white"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                                title="Save"
                              >
                                <Check size={11} className="stroke-[3]" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                                title="Cancel"
                              >
                                <X size={11} className="stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => startEditing("category-name", cat.id, undefined, cat.name)}
                              className="cursor-pointer hover:text-indigo-600 select-all border-b border-transparent hover:border-slate-300 font-semibold text-slate-700 print:text-slate-800"
                              title="Click to rename category"
                            >
                              {cat.name}
                            </span>
                          )}
                        </td>

                        {/* Col 2: Selected Vendor Name (Editable Rename + Selection Dropdown) */}
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <div className="flex flex-col gap-1.5 items-start">
                            {selectedVendor ? (
                              <div className="flex items-center gap-2">
                                {editingField.type === "vendor-name" && editingField.id === selectedVendor.id ? (
                                  <div className="flex items-center gap-1 select-none">
                                    <input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => { 
                                        if (e.key === "Enter") { saveInlineEdit(); }
                                        if (e.key === "Escape") { setEditingField({ type: null }); }
                                      }}
                                      autoFocus
                                      className="font-extrabold text-slate-900 border-b border-indigo-500 text-xs py-0.5 focus:outline-hidden w-32 bg-white"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); saveInlineEdit(); }}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition shrink-0"
                                      title="Save"
                                    >
                                      <Check size={11} className="stroke-[3]" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingField({ type: null }); }}
                                      className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                                      title="Cancel"
                                    >
                                      <X size={11} className="stroke-[3]" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      onClick={() => startEditing("vendor-name", selectedVendor.id, undefined, selectedVendor.name)}
                                      className="cursor-pointer hover:text-indigo-600 font-extrabold text-emerald-800 border-b border-transparent hover:border-slate-300 bg-emerald-50/40 px-2 py-0.5 rounded"
                                      title="Click to rename vendor globally"
                                    >
                                      {selectedVendor.name}
                                    </span>
                                    {/* Small dossier file indicators if any attached */}
                                    {(() => {
                                      const vendorFiles = getFilesForVendor(selectedVendor.id);
                                      if (vendorFiles.length > 0) {
                                        return (
                                          <div className="flex items-center gap-1 print:hidden" title={`${vendorFiles.length} file(s) attached`}>
                                            <Paperclip size={10} className="text-cyan-600 animate-pulse" />
                                            <span className="text-[9px] text-slate-400 font-mono font-bold">({vendorFiles.length})</span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs font-medium">None selected</span>
                            )}

                            {/* Dropdown to change or clear selection */}
                            <select
                              value={selectedVendorId || ""}
                              onChange={(e) => handleSelectVendor(cat.id, e.target.value)}
                              className="block w-full max-w-[170px] text-[10px] font-bold text-[#0e7490] bg-[#e0f7fa]/35 hover:bg-[#e0f7fa]/60 border border-[#bae6fd] rounded-md px-2 py-1 focus:ring-1 focus:ring-cyan-500 focus:outline-hidden cursor-pointer print:hidden transition"
                            >
                              <option value="">-- Choose Vendor --</option>
                              {getCategoryVendors(cat).map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Col 3: Amount with Breakdown */}
                        <td className="px-4 py-4 text-right font-mono text-sm antialiased">
                          {selectedVendorId ? (
                            <div className="flex flex-col items-end">
                              {/* Amount Display */}
                              <span className="font-mono text-base font-black antialiased text-emerald-800">
                                {formatCurrency(total)}
                              </span>
                              
                              {/* Example format: ($2,000 One-time + $6,000 Year 1 Annual Fee) */}
                              <span className="text-[10px] text-slate-500 font-sans tracking-tight leading-tight mt-1 select-none text-right block font-semibold">
                                ({formatCurrency(breakdown.oneTime)} One-time + {formatCurrency(breakdown.recurring)} {recurringLabel})
                              </span>

                              {/* Dual conversion display for UAE standard (or other) */}
                              {showDualConversion(total, "text-[10px] text-teal-850 font-bold font-mono leading-none mt-1 select-none text-right block")}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs select-none">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* GRAND TOTAL BLOCK - MATCHED TO 3-COLUMNS */}
                  {(() => {
                    const selectedOptionsGrandTotalBreakdown = getSelectedOptionsGrandTotalBreakdown();
                    const selectedOptionsGrandTotal = selectedOptionsGrandTotalBreakdown.oneTime + selectedOptionsGrandTotalBreakdown.recurring;
                    const grandRecurringLabel = tcoYears === 1 ? "Year 1 Annual Fee" : `${tcoYears} Year TCO Recurring`;

                    return (
                      <tr className="bg-[#e4f3f6] font-bold border-t-2 border-[#b0dfeb] print:bg-slate-50 print:border-slate-300">
                        {/* Col 1: GRAND TOTAL Label */}
                        <td className="px-4 py-5 text-xs font-black uppercase text-[#0f766e] tracking-wider print:text-[#0f766e]">
                          GRAND TOTAL
                        </td>

                        {/* Col 2: Selected Options Summary */}
                        <td className="px-4 py-5 text-left font-sans text-xs text-slate-600">
                          <span className="font-extrabold text-[#0f766e] bg-[#ccedf2] px-2 py-1 rounded">
                            Consolidated TCO Solution
                          </span>
                        </td>

                        {/* Col 3: Grand Total Amount and Breakdown */}
                        <td className="px-4 py-5 text-right font-mono text-sm antialiased bg-emerald-50/40 border-x border-emerald-150/75">
                          <div className="flex flex-col items-end">
                            <span className="font-mono text-base font-black antialiased text-[#0f766e]">
                              {formatCurrency(selectedOptionsGrandTotal)}
                            </span>
                            
                            <span className="text-[10px] text-[#0f766e] font-sans tracking-tight leading-tight mt-1 select-none text-right block font-extrabold">
                              ({formatCurrency(selectedOptionsGrandTotalBreakdown.oneTime)} One-time + {formatCurrency(selectedOptionsGrandTotalBreakdown.recurring)} {grandRecurringLabel})
                            </span>

                            {showDualConversion(selectedOptionsGrandTotal, "text-xs text-teal-850 font-bold font-mono mt-1 select-none text-right block")}
                          </div>
                        </td>
                      </tr>
                    );
                  })()}

                </tbody>
              </table>
            </div>

            {/* General executive notes comment box below the TCO table */}
            <div className="mt-8 border-t border-[#c0e6ee]/40 pt-6 flex flex-col gap-3 print:border-slate-200">
              <h4 className="text-xs font-bold tracking-widest text-[#0e7490] uppercase flex items-center gap-1.5 print:text-slate-500">
                <FileText size={14} /> Strategic Procurement Recommendation Notes
              </h4>
              <textarea
                value={project.generalNotes}
                onChange={(e) => handleGeneralNotesChange(e.target.value)}
                placeholder="Write recommendations, next actions, pricing caveats, or corporate summaries here..."
                rows={4}
                className="w-full text-xs text-slate-800 bg-white border border-[#bfe2ea] shadow-xs rounded-xl p-4 focus:outline-hidden focus:ring-1 focus:ring-cyan-500 focus:border-cyan-550 resize-none leading-relaxed print:bg-transparent print:border-0 print:p-0 print:shadow-none print:text-slate-700 print:mt-1 text-justify"
              />
            </div>

          </div>
        </section>
      </>
    )}



      </main>

      {/* Corporate signature strip */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-slate-400 text-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Vortex Offshore</p>
          <div className="flex gap-4">
            <a href="#" onClick={(e) => { e.preventDefault(); window.print(); }} className="hover:text-indigo-600 transition font-medium">Print to PDF</a>
          </div>
        </div>
      </footer>

      {/* Interactive File Viewer Lightbox / Modal */}
      {activeViewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs print:hidden animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-150 flex items-center justify-between bg-slate-50 select-none">
              <div className="flex items-center gap-2 overflow-hidden mr-4">
                <File className="text-indigo-650 shrink-0" size={16} />
                <h3 className="font-bold text-slate-800 text-xs truncate" title={activeViewFile.name}>
                  {activeViewFile.name}
                </h3>
                <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-white px-1.5 py-0.5 border border-slate-200 rounded-lg">
                  ({(activeViewFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => downloadFile(activeViewFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-55 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded-lg transition"
                >
                  <Download size={13} /> Download
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewFile(null)}
                  className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-150 rounded-lg transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body with dynamic rendering based on file type */}
            <div className="p-5 overflow-y-auto flex-1 bg-slate-100/35 flex items-center justify-center min-h-[300px]">
              {activeViewFile.type.startsWith("image/") ? (
                <img 
                  src={activeViewFile.base64} 
                  alt={activeViewFile.name} 
                  className="max-h-[55vh] object-contain rounded-lg shadow-sm border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : activeViewFile.type === "application/pdf" ? (
                <iframe 
                  src={activeViewFile.base64} 
                  title={activeViewFile.name} 
                  className="w-full h-[55vh] rounded-lg border border-slate-250 shadow-inner"
                />
              ) : activeViewFile.type.startsWith("text/") || activeViewFile.name.endsWith(".csv") || activeViewFile.name.endsWith(".json") || activeViewFile.name.endsWith(".xml") ? (
                <pre className="w-full text-[10px] font-mono whitespace-pre-wrap break-all bg-slate-900 text-slate-300 p-4 rounded-xl max-h-[55vh] overflow-y-auto leading-relaxed shadow-inner">
                  {getDecodedText(activeViewFile.base64)}
                </pre>
              ) : (
                <div className="text-center flex flex-col items-center gap-3 p-8">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center">
                    <File size={26} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-xs">Dynamic Preview Unavailable</h4>
                  <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                    This file format does not support plain text previews inside the app sandbox. Click Download on the top right to view with external specialist software local spreadsheets (e.g. MS Excel).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reusable Premium Non-blocking Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="flex-grow select-none">
                <h3 className="font-bold text-slate-900 text-sm tracking-tight">{confirmDialog.title}</h3>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-3.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-[11px] rounded-lg transition duration-100 cursor-pointer"
              >
                No, Keep It
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg transition duration-100 shadow-sm cursor-pointer"
              >
                Yes, Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog Backdrop for Transposed Layout cost trackers */}
      {modalTrackerInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs print:hidden animate-fade-in text-left">
          <div className="bg-white rounded-2xl max-w-6xl w-full p-5 shadow-2xl border border-slate-200 flex flex-col gap-3 animate-scale-up max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-150">
              <h3 className="font-extrabold text-slate-950 text-sm flex items-center gap-1.5 select-none font-sans">
                <Calendar size={16} className="text-cyan-650" />
                Detailed Project Cost Estimate
              </h3>
              <button
                type="button"
                onClick={() => setModalTrackerInfo(null)}
                className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-0.5">
              <MonthlyCostTrackerComponent 
                catId={modalTrackerInfo.catId}
                compId={modalTrackerInfo.compId}
                compName={modalTrackerInfo.compName}
              />
            </div>

            <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalTrackerInfo(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-750 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Discard & Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
