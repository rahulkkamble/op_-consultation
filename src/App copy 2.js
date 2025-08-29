// src/AppConsult.js
// Consultation form (React + Bootstrap) - builds a FHIR Bundle (Consultation) and SUBMITS it
// - Uses patients.json from public/ for patient dropdown + autofill
// - On Submit: builds bundle, console.logs the JSON ("json pushed on server"), then attempts a POST to /api/consultations (optional, backend dependent)
// - No compare modal / no download button — only submit flow as requested

import React, { useEffect, useState, useRef } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

/* ---------------- Utility helpers ---------------- */

// lightweight uuid for UI usage
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Return ISO string with local timezone offset (YYYY-MM-DDThh:mm:ss+05:30)
function getISOWithOffsetFromDateInput(dateInput /* optional 'YYYY-MM-DD' */) {
  const now = new Date();
  let d;
  if (dateInput) {
    const [y, m, day] = dateInput.split("-");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    d = new Date(`${y}-${m}-${day}T${hh}:${mm}:${ss}`);
  } else {
    d = now;
  }
  const tzOffsetMin = d.getTimezoneOffset();
  const sign = tzOffsetMin > 0 ? "-" : "+";
  const pad = (n) => String(n).padStart(2, "0");
  const offsetHr = pad(Math.floor(Math.abs(tzOffsetMin) / 60));
  const offsetMin = pad(Math.abs(tzOffsetMin) % 60);
  return d.toISOString().replace("Z", `${sign}${offsetHr}:${offsetMin}`);
}

// Build minimal XHTML narrative with language attributes
function buildNarrative(title, html) {
  return `<div xmlns="http://www.w3.org/1999/xhtml" lang="en-IN" xml:lang="en-IN"><h3>${title}</h3>${html}</div>`;
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

// Map patient object from public file / API to form fields
function mapApiPatientToForm(apiPatient) {
  if (!apiPatient) return { name: "", mrn: "", birthDate: "", gender: "", phone: "" };
  const name = apiPatient.name || `${apiPatient.firstName || ""} ${apiPatient.lastName || ""}`.trim();
  const mrn = apiPatient.abha_ref || apiPatient.mrn || apiPatient.id || apiPatient.user_id || "";
  let birthDate = apiPatient.dob || apiPatient.birthDate || "";
  if (birthDate && birthDate.includes("-")) {
    const parts = birthDate.split("-");
    if (parts.length === 3 && parts[0].length === 2) {
      birthDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return {
    name,
    mrn,
    birthDate,
    gender: (apiPatient.gender || "").toLowerCase() || "",
    phone: apiPatient.mobile || apiPatient.phone || "",
  };
}

/* ---------------- AppConsult component ---------------- */

export default function AppConsult() {
  /* Practitioner */
  const [practitioner, setPractitioner] = useState({
    name: "Dr. DEF",
    license: "21-1521-3828-3227",
  });

  /* Patient form (autofill from patients.json) */
  const [patient, setPatient] = useState({
    name: "ABC",
    mrn: "22-7225-4829-5255",
    birthDate: "1981-01-12",
    gender: "male",
    phone: "+919818512600",
  });

  /* Composition / Consultation header */
  const [composition, setComposition] = useState({
    title: "Clinical consultation report",
    status: "final",
    date: new Date().toISOString().slice(0, 10),
  });

  /* Chief complaints (dynamic list) */
  const [chiefComplaints, setChiefComplaints] = useState([
    { id: uuidv4(), text: "Abdominal pain", code: "21522001" },
  ]);

  /* Vitals (observations list) */
  const [vitals, setVitals] = useState([
    { id: uuidv4(), name: "Temperature", value: "98.6", unit: "F", code: "8310-5" },
    { id: uuidv4(), name: "Blood pressure", value: "120/80", unit: "mmHg", code: "85354-9" },
  ]);

  /* Physical exam text */
  const [physicalExam, setPhysicalExam] = useState("General physical examination within normal limits.");

  /* Investigations (advice/requests) */
  const [investigations, setInvestigations] = useState([
    { id: uuidv4(), text: "Complete blood count", code: "CBC" },
  ]);

  /* Provisional diagnosis / final diagnosis */
  const [diagnosis, setDiagnosis] = useState({ text: "Suspected gastroenteritis", code: "" });

  /* Medications (same structure as prescription) */
  const [medications, setMedications] = useState([
    {
      id: uuidv4(),
      medicationText: "Paracetamol 500mg Tablet",
      medicationCode: "",
      dosageText: "One tablet every 6 hours as needed",
    },
  ]);

  /* Follow-up */
  const [followUp, setFollowUp] = useState({ text: "Follow-up after 7 days" });

  /* Attachment (optional) */
  const [attachmentBase64, setAttachmentBase64] = useState(null);
  const [attachmentMime, setAttachmentMime] = useState(null);
  const fileRef = useRef();

  /* UI state */
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* Patient search/autofill (public/patients.json) */
  const [patientListAll, setPatientListAll] = useState([]);
  const [patientList, setPatientList] = useState([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(localStorage.getItem("selectedPatientId") || "");
  const patientCacheRef = useRef(new Map());
  const patientSearchTimeoutRef = useRef(null);

  useEffect(() => {
    // load patients.json from public/
    async function loadPatientsFile() {
      setPatientLoading(true);
      try {
        const res = await fetch("/patients.json");
        if (!res.ok) throw new Error(`Failed to load patients.json (${res.status})`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("patients.json must be an array");
        setPatientListAll(data);
        setPatientList(data.slice(0, 50));
      } catch (err) {
        console.error("loadPatientsFile:", err);
        setPatientError(err.message || "Failed to load patient list");
      } finally {
        setPatientLoading(false);
      }
    }
    loadPatientsFile();
  }, []);

  // Debounced filtering
  useEffect(() => {
    if (patientSearchTimeoutRef.current) clearTimeout(patientSearchTimeoutRef.current);
    setPatientLoading(true);
    patientSearchTimeoutRef.current = setTimeout(() => {
      const q = (patientQuery || "").trim().toLowerCase();
      if (!q) {
        setPatientList(patientListAll.slice(0, 50));
        setPatientLoading(false);
        return;
      }
      const filtered = patientListAll.filter((p) => {
        const name = (p.name || "").toLowerCase();
        const mrn = (p.mrn || p.abha_ref || p.id || p.user_id || "").toLowerCase();
        const phone = (p.mobile || p.phone || "").toLowerCase();
        return name.includes(q) || mrn.includes(q) || phone.includes(q);
      });
      setPatientList(filtered.slice(0, 200));
      setPatientLoading(false);
    }, 300);
    return () => {
      if (patientSearchTimeoutRef.current) clearTimeout(patientSearchTimeoutRef.current);
    };
  }, [patientQuery, patientListAll]);

  async function handlePatientSelect(id) {
    setSelectedPatientId(id || "");
    localStorage.setItem("selectedPatientId", id || "");
    if (!id) {
      setPatient({ name: "", mrn: "", birthDate: "", gender: "", phone: "" });
      return;
    }
    if (patientCacheRef.current.has(id)) {
      setPatient(mapApiPatientToForm(patientCacheRef.current.get(id)));
      return;
    }
    const found = patientListAll.find(
      (p) => (p.user_id || p.id || p.mrn || p.abha_ref) === id || p.user_id === id || p.id === id
    );
    if (found) {
      patientCacheRef.current.set(id, found);
      setPatient(mapApiPatientToForm(found));
      return;
    }
    // optional fallback fetch (if you store each patient as separate JSON under /patients/{id}.json)
    try {
      setPatientLoading(true);
      const res = await fetch(`/patients/${encodeURIComponent(id)}.json`);
      if (!res.ok) throw new Error("Detail not found");
      const detail = await res.json();
      patientCacheRef.current.set(id, detail);
      setPatient(mapApiPatientToForm(detail));
    } catch (err) {
      console.warn("fallback patient detail fetch failed:", err);
      setPatient({ name: "", mrn: "", birthDate: "", gender: "", phone: "" });
    } finally {
      setPatientLoading(false);
    }
  }

  // map helper (same as above scope)
  function mapApiPatientToForm(apiPatient) {
    return mapApiPatientToForm_default(apiPatient);
  }
  // function to avoid name conflict
  function mapApiPatientToForm_default(apiPatient) {
    if (!apiPatient) return { name: "", mrn: "", birthDate: "", gender: "", phone: "" };
    const name = apiPatient.name || `${apiPatient.firstName || ""} ${apiPatient.lastName || ""}`.trim();
    const mrn = apiPatient.abha_ref || apiPatient.mrn || apiPatient.id || apiPatient.user_id || "";
    let birthDate = apiPatient.dob || apiPatient.birthDate || "";
    if (birthDate && birthDate.includes("-")) {
      const parts = birthDate.split("-");
      if (parts.length === 3 && parts[0].length === 2) {
        birthDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
    return {
      name,
      mrn,
      birthDate,
      gender: (apiPatient.gender || "").toLowerCase() || "",
      phone: apiPatient.mobile || apiPatient.phone || "",
    };
  }

  /* Handlers for field changes */
  const handlePractitionerChange = (e) => setPractitioner({ ...practitioner, [e.target.name]: e.target.value });
  const handlePatientChange = (e) => setPatient({ ...patient, [e.target.name]: e.target.value });
  const handleCompositionChange = (e) => setComposition({ ...composition, [e.target.name]: e.target.value });

  /* Chief complaints functions */
  function addChiefComplaint() {
    setChiefComplaints([...chiefComplaints, { id: uuidv4(), text: "", code: "" }]);
  }
  function updateChiefComplaint(idx, field, val) {
    const copy = [...chiefComplaints];
    copy[idx][field] = val;
    setChiefComplaints(copy);
  }
  function removeChiefComplaint(idx) {
    if (chiefComplaints.length === 1) return;
    const copy = [...chiefComplaints];
    copy.splice(idx, 1);
    setChiefComplaints(copy);
  }

  /* Vitals functions */
  function addVital() {
    setVitals([...vitals, { id: uuidv4(), name: "", value: "", unit: "", code: "" }]);
  }
  function updateVital(idx, field, val) {
    const copy = [...vitals];
    copy[idx][field] = val;
    setVitals(copy);
  }
  function removeVital(idx) {
    if (vitals.length === 1) return;
    const copy = [...vitals];
    copy.splice(idx, 1);
    setVitals(copy);
  }

  /* Investigations */
  function addInvestigation() {
    setInvestigations([...investigations, { id: uuidv4(), text: "", code: "" }]);
  }
  function updateInvestigation(idx, field, val) {
    const copy = [...investigations];
    copy[idx][field] = val;
    setInvestigations(copy);
  }
  function removeInvestigation(idx) {
    if (investigations.length === 1) return;
    const copy = [...investigations];
    copy.splice(idx, 1);
    setInvestigations(copy);
  }

  /* Medications */
  function addMedication() {
    setMedications([...medications, { id: uuidv4(), medicationText: "", medicationCode: "", dosageText: "" }]);
  }
  function updateMedication(idx, field, val) {
    const copy = [...medications];
    copy[idx][field] = val;
    setMedications(copy);
  }
  function removeMedication(idx) {
    if (medications.length === 1) return;
    const copy = [...medications];
    copy.splice(idx, 1);
    setMedications(copy);
  }

  /* File -> base64 */
  const handleFile = (file) => {
    if (!file) {
      setAttachmentBase64(null);
      setAttachmentMime(null);
      return;
    }
    if (file.type !== "application/pdf") {
      alert("Only PDF attachments allowed.");
      fileRef.current.value = "";
      setAttachmentBase64(null);
      setAttachmentMime(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const base64 = e.target.result.split(",")[1];
      setAttachmentBase64(base64);
      setAttachmentMime(file.type);
    };
    reader.onerror = function () {
      alert("Failed to read file.");
      setAttachmentBase64(null);
      setAttachmentMime(null);
    };
    reader.readAsDataURL(file);
  };

  /* ---------------- Build FHIR Bundle for consultation ---------------- */
  const buildBundle = () => {
    // perform lightweight validation
    if (!practitioner.name || !practitioner.license) {
      setErrorMsg("Practitioner name and license are required.");
      throw new Error("Practitioner name and license are required.");
    }
    if (!patient.name || !patient.mrn || !patient.birthDate) {
      setErrorMsg("Patient name, MRN and DOB are required.");
      throw new Error("Patient name, MRN and DOB are required.");
    }
    if (!composition.title || !composition.date) {
      setErrorMsg("Consultation title and date are required.");
      throw new Error("Consultation title and date are required.");
    }

    setErrorMsg("");
    setSuccessMsg("");

    const compId = uuidv4();
    const practitionerId = uuidv4();
    const patientId = uuidv4();
    const conditionId = uuidv4();
    const vitObsIds = vitals.map(() => uuidv4());
    const medReqIds = medications.map(() => uuidv4());
    const invObsIds = investigations.map(() => uuidv4());
    const binaryId = attachmentBase64 ? uuidv4() : null;

    // Bundle meta
    const bundleMeta = {
      versionId: "1",
      lastUpdated: getISOWithOffsetFromDateInput(),
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"],
    };

    // Composition resource (Consultation)
    const compositionResource = {
      resourceType: "Composition",
      id: compId,
      meta: {
        versionId: "1",
        lastUpdated: getISOWithOffsetFromDateInput(),
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/ConsultationRecord"],
      },
      language: "en-IN",
      text: {
        status: "generated",
        div: buildNarrative("Consultation", `<p>Consultation ${compId}</p><p>date: ${composition.date}</p>`),
      },
      identifier: { system: "https://ndhm.in/consult", value: uuidv4() },
      status: composition.status === "final" ? "final" : composition.status,
      type: {
        coding: [
          { system: "http://snomed.info/sct", code: "371530004", display: "Clinical consultation report" },
        ],
        text: "Clinical consultation report",
      },
      subject: { reference: `urn:uuid:${patientId}`, display: "Patient" },
      date: getISOWithOffsetFromDateInput(composition.date),
      author: [{ reference: `urn:uuid:${practitionerId}`, display: "Practitioner" }],
      title: composition.title,
      section: [
        // Chief complaints
        {
          title: "Chief Complaints",
          code: { coding: [{ system: "http://snomed.info/sct", code: "422843007", display: "Chief complaint section" }] },
          entry: chiefComplaints.map((cc) => ({ reference: `urn:uuid:${uuidv4()}`, display: cc.text })), // We'll add Condition resources separately only for diagnosis; chief complaints can be textual
          text: { status: "generated", div: buildNarrative("Chief complaints", `<p>${chiefComplaints.map((c) => c.text).join(", ")}</p>`) },
        },
        // Physical exam
        {
          title: "Physical Examination",
          code: { coding: [{ system: "http://snomed.info/sct", code: "425044008", display: "Physical exam section" }] },
          text: { status: "generated", div: buildNarrative("Physical exam", `<p>${physicalExam}</p>`) },
        },
        // Vitals (observations will be referenced)
        {
          title: "Vitals",
          code: { coding: [{ system: "http://snomed.info/sct", code: "425044008", display: "Physical exam section" }] },
          entry: vitObsIds.map((id) => ({ reference: `urn:uuid:${id}` })),
          text: { status: "generated", div: buildNarrative("Vitals", `<p>${vitals.map((v) => `${v.name}: ${v.value} ${v.unit}`).join("; ")}</p>`) },
        },
        // Investigations
        {
          title: "Investigations",
          code: { coding: [{ system: "http://snomed.info/sct", code: "721963009", display: "Order document" }] },
          entry: invObsIds.map((id) => ({ reference: `urn:uuid:${id}` })),
          text: { status: "generated", div: buildNarrative("Investigations", `<p>${investigations.map((i) => i.text).join(", ")}</p>`) },
        },
        // Medications
        {
          title: "Medications",
          code: { coding: [{ system: "http://snomed.info/sct", code: "721912009", display: "Medication summary document" }] },
          entry: medReqIds.map((id) => ({ reference: `urn:uuid:${id}` })),
          text: { status: "generated", div: buildNarrative("Medications", `<p>${medications.map((m) => m.medicationText).join(", ")}</p>`) },
        },
        // Follow-up
        {
          title: "Follow Up",
          code: { coding: [{ system: "http://snomed.info/sct", code: "390906007", display: "Follow-up encounter" }] },
          text: { status: "generated", div: buildNarrative("Follow up", `<p>${followUp.text}</p>`) },
        },
      ],
    };

    // Patient resource
    const patientResource = {
      resourceType: "Patient",
      id: patientId,
      meta: { versionId: "1", lastUpdated: getISOWithOffsetFromDateInput(), profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"] },
      text: { status: "generated", div: buildNarrative("Patient", `<p>${patient.name} — DoB: ${patient.birthDate}</p>`) },
      identifier: [
        {
          type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR", display: "Medical record number" }] },
          system: "https://healthid.ndhm.gov.in",
          value: patient.mrn,
        },
      ],
      name: [{ text: patient.name }],
      telecom: [{ system: "phone", value: patient.phone, use: "home" }],
      gender: patient.gender,
      birthDate: patient.birthDate,
    };

    // Practitioner resource
    const practitionerResource = {
      resourceType: "Practitioner",
      id: practitionerId,
      meta: { versionId: "1", lastUpdated: getISOWithOffsetFromDateInput(), profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner"] },
      text: { status: "generated", div: buildNarrative("Practitioner", `<p>${practitioner.name}</p>`) },
      identifier: [
        {
          type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MD", display: "Medical License number" }] },
          system: "https://doctor.ndhm.gov.in",
          value: practitioner.license,
        },
      ],
      name: [{ text: practitioner.name }],
    };

    // Observations for vitals
    const vitalObservations = vitals.map((v, idx) => ({
      resourceType: "Observation",
      id: vitObsIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"] },
      text: { status: "generated", div: buildNarrative("Observation", `<p>${v.name}: ${v.value} ${v.unit}</p>`) },
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }],
      code: { text: v.name, coding: v.code ? [{ system: "http://loinc.org", code: v.code, display: v.name }] : undefined },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      effectiveDateTime: getISOWithOffsetFromDateInput(composition.date),
      valueString: `${v.value} ${v.unit}`,
      performer: [{ reference: `urn:uuid:${practitionerId}`, display: practitioner.name }],
    }));

    // Investigation Observations (requests/notes)
    const investigationResources = investigations.map((inv, idx) => ({
      resourceType: "Observation",
      id: invObsIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"] },
      text: { status: "generated", div: buildNarrative("Investigation", `<p>${inv.text}</p>`) },
      status: "final",
      code: { text: inv.text },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      effectiveDateTime: getISOWithOffsetFromDateInput(composition.date),
    }));

    // Condition (diagnosis) — include coding only if code provided
    const conditionResource = {
      resourceType: "Condition",
      id: conditionId,
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition"] },
      text: { status: "generated", div: buildNarrative("Condition", `<p>${diagnosis.text}</p>`) },
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active", display: "Active" }] },
      code:
        diagnosis.code && String(diagnosis.code).trim() !== ""
          ? { coding: [{ system: "http://snomed.info/sct", code: diagnosis.code.trim(), display: diagnosis.text }], text: diagnosis.text }
          : { text: diagnosis.text },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
    };

    // MedicationRequests
    const medicationResources = medications.map((m, idx) => ({
      resourceType: "MedicationRequest",
      id: medReqIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationRequest"] },
      text: { status: "generated", div: buildNarrative("MedicationRequest", `<p>${m.medicationText}</p><p>${m.dosageText}</p>`) },
      status: "active",
      intent: "order",
      medicationCodeableConcept:
        m.medicationCode && m.medicationCode.trim() !== ""
          ? { coding: [{ system: "http://snomed.info/sct", code: m.medicationCode.trim(), display: m.medicationText }] }
          : { text: m.medicationText },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      authoredOn: composition.date,
      requester: { reference: `urn:uuid:${practitionerId}`, display: practitioner.name },
      dosageInstruction: [{ text: m.dosageText }],
      reasonReference: [{ reference: `urn:uuid:${conditionId}`, display: "Condition" }],
    }));

    // Binary (attachment) optional
    const binaryResource = attachmentBase64
      ? {
          resourceType: "Binary",
          id: binaryId,
          meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Binary"] },
          contentType: attachmentMime,
          data: attachmentBase64,
        }
      : null;

    // Compose entries in order: Composition, Patient, Practitioner, Observations (vitals), Investigations, MedicationRequests, Condition, Binary (if any)
    const entries = [];
    entries.push({ fullUrl: `urn:uuid:${compositionResource.id}`, resource: compositionResource });
    entries.push({ fullUrl: `urn:uuid:${patientResource.id}`, resource: patientResource });
    entries.push({ fullUrl: `urn:uuid:${practitionerResource.id}`, resource: practitionerResource });
    vitalObservations.forEach((o) => entries.push({ fullUrl: `urn:uuid:${o.id}`, resource: o }));
    investigationResources.forEach((o) => entries.push({ fullUrl: `urn:uuid:${o.id}`, resource: o }));
    medicationResources.forEach((m) => entries.push({ fullUrl: `urn:uuid:${m.id}`, resource: m }));
    entries.push({ fullUrl: `urn:uuid:${conditionResource.id}`, resource: conditionResource });
    if (binaryResource) entries.push({ fullUrl: `urn:uuid:${binaryResource.id}`, resource: binaryResource });

    const bundle = {
      resourceType: "Bundle",
      id: `Consultation-${uuidv4()}`,
      meta: { versionId: "1", lastUpdated: getISOWithOffsetFromDateInput() },
      type: "document",
      timestamp: getISOWithOffsetFromDateInput(),
      entry: entries,
    };

    return bundle;
  };

  /* ---------------- Submit behavior ---------------- */
  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    let bundle;
    try {
      bundle = buildBundle();
    } catch (err) {
      // buildBundle throws after setting errorMsg
      return;
    }

    // Console log the JSON as requested (simulate "pushed on server")
    console.log("json pushed on server:", bundle);

    // Attempt to POST to API endpoint (optional; harmless if no backend)
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      if (!res.ok) {
        // server may not exist; still show success of frontend push
        console.warn("Server responded with non-OK status", res.status);
        setSuccessMsg("Form submitted (frontend). Server returned status: " + res.status);
      } else {
        const json = await res.json().catch(() => null);
        setSuccessMsg("Form submitted and saved on server.");
        console.log("Server response:", json);
      }
    } catch (err) {
      // network error or endpoint not present
      console.warn("POST to /api/consultations failed (this is expected in demo):", err);
      setSuccessMsg("Form submitted locally (console). Server push attempted but failed (see console).");
    }
  };

  return (
    <div className="container py-4">
      <h2 className="mb-3">OP Consultation Form — Submit Only</h2>

      {/* Practitioner */}
      <div className="card mb-3">
        <div className="card-header">1. Practitioner (You) <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Practitioner Name <span className="text-danger">*</span></label>
              <input name="name" type="text" className="form-control" value={practitioner.name} onChange={handlePractitionerChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Medical License No. <span className="text-danger">*</span></label>
              <input name="license" type="text" className="form-control" value={practitioner.license} onChange={handlePractitionerChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Patient */}
      <div className="card mb-3">
        <div className="card-header">2. Patient Info <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label">Search patient</label>
              <input className="form-control" placeholder="Type name / MRN / phone..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
              <div className="mt-1">
                {patientLoading ? <div className="small text-muted">Searching…</div> : patientError ? <div className="small text-danger">{patientError}</div> : null}
              </div>
            </div>

            <div className="col-md-4">
              <label className="form-label">Select Patient</label>
              <select className="form-select" value={selectedPatientId} onChange={(e) => handlePatientSelect(e.target.value)}>
                <option value="">-- Select a patient --</option>
                {patientList.map((p) => (
                  <option key={p.user_id || p.id || p.mrn} value={p.user_id || p.id || p.mrn || p.abha_ref}>
                    {p.name} {p.mobile ? `(${p.mobile})` : ""} {p.abha_ref ? ` — ${p.abha_ref}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label">Phone</label>
              <input name="phone" type="tel" className="form-control" value={patient.phone} onChange={handlePatientChange} />
            </div>

            <div className="col-md-4 mt-2">
              <label className="form-label">Full Name <span className="text-danger">*</span></label>
              <input name="name" type="text" className="form-control" value={patient.name} onChange={handlePatientChange} />
            </div>
            <div className="col-md-4 mt-2">
              <label className="form-label">Medical Record No. <span className="text-danger">*</span></label>
              <input name="mrn" type="text" className="form-control" value={patient.mrn} onChange={handlePatientChange} />
            </div>
            <div className="col-md-4 mt-2">
              <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
              <input name="birthDate" type="date" className="form-control" value={patient.birthDate} onChange={handlePatientChange} />
            </div>

            <div className="col-md-4 mt-2">
              <label className="form-label">Gender <span className="text-danger">*</span></label>
              <select name="gender" className="form-select" value={patient.gender} onChange={handlePatientChange}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Consultation header */}
      <div className="card mb-3 border-info">
        <div className="card-header bg-info text-white">3. Consultation Info <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Title <span className="text-danger">*</span></label>
              <input name="title" className="form-control" value={composition.title} onChange={handleCompositionChange} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Status <span className="text-danger">*</span></label>
              <select name="status" className="form-select" value={composition.status} onChange={handleCompositionChange}>
                <option value="final">Final</option>
                <option value="preliminary">Preliminary</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Date <span className="text-danger">*</span></label>
              <input name="date" type="date" className="form-control" value={composition.date} onChange={handleCompositionChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Chief complaints */}
      <div className="card mb-3">
        <div className="card-header">4. Chief Complaints (one or more) <span className="text-danger">*</span></div>
        <div className="card-body">
          {chiefComplaints.map((cc, idx) => (
            <div key={cc.id} className="mb-2 border rounded p-2">
              <div className="row g-2 align-items-end">
                <div className="col-md-8">
                  <label className="form-label">Complaint <span className="text-danger">*</span></label>
                  <input className="form-control" value={cc.text} onChange={(e) => updateChiefComplaint(idx, "text", e.target.value)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">SNOMED code (optional)</label>
                  <input className="form-control" value={cc.code} onChange={(e) => updateChiefComplaint(idx, "code", e.target.value)} />
                </div>
                <div className="col-md-1">
                  <button className="btn btn-danger" onClick={() => removeChiefComplaint(idx)} disabled={chiefComplaints.length === 1}>X</button>
                </div>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={addChiefComplaint}>+ Add complaint</button>
        </div>
      </div>

      {/* Vitals */}
      <div className="card mb-3">
        <div className="card-header">5. Vitals</div>
        <div className="card-body">
          {vitals.map((v, idx) => (
            <div key={v.id} className="row g-2 align-items-end mb-2">
              <div className="col-md-3">
                <label className="form-label">Name</label>
                <input className="form-control" value={v.name} onChange={(e) => updateVital(idx, "name", e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Value</label>
                <input className="form-control" value={v.value} onChange={(e) => updateVital(idx, "value", e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Unit</label>
                <input className="form-control" value={v.unit} onChange={(e) => updateVital(idx, "unit", e.target.value)} />
              </div>
              <div className="col-md-2">
                <label className="form-label">Code (LOINC)</label>
                <input className="form-control" value={v.code} onChange={(e) => updateVital(idx, "code", e.target.value)} />
              </div>
              <div className="col-md-1">
                <button className="btn btn-danger" onClick={() => removeVital(idx)} disabled={vitals.length === 1}>X</button>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={addVital}>+ Add vital</button>
        </div>
      </div>

      {/* Physical exam */}
      <div className="card mb-3">
        <div className="card-header">6. Physical Examination</div>
        <div className="card-body">
          <textarea className="form-control" rows="4" value={physicalExam} onChange={(e) => setPhysicalExam(e.target.value)} />
        </div>
      </div>

      {/* Investigations */}
      <div className="card mb-3">
        <div className="card-header">7. Investigations / Advice</div>
        <div className="card-body">
          {investigations.map((inv, idx) => (
            <div key={inv.id} className="row g-2 align-items-end mb-2">
              <div className="col-md-8">
                <label className="form-label">Investigation / Advice</label>
                <input className="form-control" value={inv.text} onChange={(e) => updateInvestigation(idx, "text", e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Code (optional)</label>
                <input className="form-control" value={inv.code} onChange={(e) => updateInvestigation(idx, "code", e.target.value)} />
              </div>
              <div className="col-md-1">
                <button className="btn btn-danger" onClick={() => removeInvestigation(idx)} disabled={investigations.length === 1}>X</button>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={addInvestigation}>+ Add investigation</button>
        </div>
      </div>

      {/* Diagnosis */}
      <div className="card mb-3">
        <div className="card-header">8. Diagnosis</div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-9">
              <label className="form-label">Diagnosis text</label>
              <input className="form-control" value={diagnosis.text} onChange={(e) => setDiagnosis({ ...diagnosis, text: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">SNOMED code (optional)</label>
              <input className="form-control" value={diagnosis.code} onChange={(e) => setDiagnosis({ ...diagnosis, code: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      {/* Medications */}
      <div className="card mb-3">
        <div className="card-header">9. Medications</div>
        <div className="card-body">
          {medications.map((m, idx) => (
            <div key={m.id} className="row g-2 align-items-end mb-2">
              <div className="col-md-6">
                <label className="form-label">Drug</label>
                <input className="form-control" value={m.medicationText} onChange={(e) => updateMedication(idx, "medicationText", e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">SNOMED code (optional)</label>
                <input className="form-control" value={m.medicationCode} onChange={(e) => updateMedication(idx, "medicationCode", e.target.value)} />
              </div>
              <div className="col-md-2">
                <label className="form-label">Dosage text</label>
                <input className="form-control" value={m.dosageText} onChange={(e) => updateMedication(idx, "dosageText", e.target.value)} />
              </div>
              <div className="col-md-1">
                <button className="btn btn-danger" onClick={() => removeMedication(idx)} disabled={medications.length === 1}>X</button>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={addMedication}>+ Add medication</button>
        </div>
      </div>

      {/* Follow-up */}
      <div className="card mb-3">
        <div className="card-header">10. Follow-up</div>
        <div className="card-body">
          <input className="form-control" value={followUp.text} onChange={(e) => setFollowUp({ text: e.target.value })} />
        </div>
      </div>

      {/* Attachment */}
      <div className="card mb-3">
        <div className="card-header">11. Attachment (optional)</div>
        <div className="card-body">
          <input type="file" accept="application/pdf" ref={fileRef} onChange={(e) => handleFile(e.target.files[0])} />
          <small className="text-muted d-block mt-2">PDF will be encoded as Binary.data (base64)</small>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4">
        <button className="btn btn-success me-2" onClick={handleSubmit}>Submit Consultation</button>
        {errorMsg && <div className="alert alert-danger mt-2">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success mt-2">{successMsg}</div>}
      </div>

      <footer className="text-muted mt-4">
        <small>Notes: This demo logs the generated bundle in the browser console as "json pushed on server". It also attempts a POST to <code>/api/consultations</code> — adjust endpoint and headers for your backend. Patients are loaded from <code>/patients.json</code> in public/ by default.</small>
      </footer>
    </div>
  );
}
