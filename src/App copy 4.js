// src/App.js
import React, { useState, useRef, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

/* Lightweight UUID generator for UI use */
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* Return ISO string with local timezone offset, e.g. 2025-08-12T14:35:21+05:30 */
function getISOWithOffsetFromDateInput(dateInput /* optional 'YYYY-MM-DD' */) {
  const now = new Date();
  let d;
  if (dateInput) {
    // combine date with current time so we have a timezone offset appended
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

/* Minimal XHTML narrative wrapper */
function buildNarrative(title, html) {
  // Keep as-is to avoid changing existing bundle output
  return `<div xmlns="http://www.w3.org/1999/xhtml" lang="en-IN" xml:lang="en-IN"><h3>${title}</h3>${html}</div>`;
}

/* Helper: build a Narrative object or undefined */
function makeSectionNarrative(title, rawText) {
  const t = rawText ? String(rawText).trim() : "";
  if (!t) return undefined;
  return {
    status: "generated",
    div: buildNarrative(title, `<p>${t}</p>`),
  };
}

/* Pretty JSON */
const pretty = (o) => JSON.stringify(o, null, 2);

/* Helpers for patient JSON mapping */
const mapGender = (g) => {
  if (!g) return "";
  const t = String(g).toLowerCase();
  if (t.startsWith("male")) return "male";
  if (t.startsWith("female")) return "female";
  if (t.startsWith("other")) return "other";
  return "unknown";
};
const ddmmyyyyToISO = (dob) => {
  if (!dob) return "";
  const parts = String(dob).split("-");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (!yyyy || !mm || !dd) return "";
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};
const normalizeAbhaAddresses = (patientObj) => {
  const raw =
    patientObj?.additional_attributes?.abha_addresses &&
    Array.isArray(patientObj.additional_attributes.abha_addresses)
      ? patientObj.additional_attributes.abha_addresses
      : [];
  const out = raw
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { value: item, label: item, primary: false };
      }
      if (typeof item === "object" && item.address) {
        return {
          value: String(item.address),
          label: item.isPrimary ? `${item.address} (primary)` : String(item.address),
          primary: !!item.isPrimary,
        };
      }
      return null;
    })
    .filter(Boolean);
  // primary first, then alphabetical
  out.sort((a, b) => (b.primary - a.primary) || a.value.localeCompare(b.value));
  return out;
};

export default function AppConsult() {
  // Practitioner (author)
  const [practitioner, setPractitioner] = useState({
    name: "Dr. DEF",
    license: "MD-12345-6789",
  });

  // Patient (form state used by the bundle) — keep this shape the same
  const [patient, setPatient] = useState({
    name: "ABC",
    mrn: "MR-001-2025",
    birthDate: "1985-04-12",
    gender: "male",
    phone: "+911234567890",
  });

  // Patient list (mock "API") + selection/ABHA UI state
  const [patientsList, setPatientsList] = useState([]);
  const [selectedPatientIdx, setSelectedPatientIdx] = useState(-1);
  const [abhaList, setAbhaList] = useState([]);
  const [selectedAbha, setSelectedAbha] = useState("");
  const [selectedAbhaNumber, setSelectedAbhaNumber] = useState(""); // abha_ref, read-only display

  useEffect(() => {
    // Load mock patients from /public/patients.json
    (async () => {
      try {
        const res = await fetch("/patients.json");
        const data = await res.json();
        setPatientsList(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load patients.json", e);
      }
    })();
  }, []);

  // When user picks a patient from dropdown, populate the form fields only (bundle stays the same)
  const handlePatientSelectFromList = (e) => {
    const idx = Number(e.target.value);
    setSelectedPatientIdx(idx);
    const p = patientsList[idx];
    if (!p) {
      setAbhaList([]);
      setSelectedAbha("");
      setSelectedAbhaNumber("");
      return;
    }
    // Fill parts of the patient form (NOT touching MRN so your bundle shape stays same)
    setPatient((prev) => ({
      ...prev,
      name: p.name || "",
      phone: p.mobile ? (String(p.mobile).startsWith("+") ? String(p.mobile) : `+91${p.mobile}`) : "",
      gender: mapGender(p.gender),
      birthDate: ddmmyyyyToISO(p.dob),
    }));
    // ABHA UI
    const abhas = normalizeAbhaAddresses(p);
    setAbhaList(abhas);
    setSelectedAbha(abhas.length ? abhas[0].value : "");
    setSelectedAbhaNumber(p.abha_ref || "");
  };

  // Composition metadata
  const [composition, setComposition] = useState({
    title: "OP Consultation Note",
    status: "final",
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  });

  // Primary diagnosis / condition
  const [condition, setCondition] = useState({
    text: "Hypertension",
    code: "", // optional SNOMED code
    clinicalStatus: "active",
  });

  // Dynamic lists
  const [chiefComplaints, setChiefComplaints] = useState([{ id: uuidv4(), text: "Headache for 3 days" }]);
  const [physicalExams, setPhysicalExams] = useState([{ id: uuidv4(), text: "BP: 150/90 mmHg" }]);
  const [allergies, setAllergies] = useState([{ id: uuidv4(), text: "None" }]);
  const [medications, setMedications] = useState([
    { id: uuidv4(), medicationText: "Amlodipine 5 mg", medicationCode: "", note: "Once daily" },
  ]);

  // Free text sections
  const [historyText, setHistoryText] = useState("Patient with episodic headaches.");
  const [investigationsText, setInvestigationsText] = useState("");
  const [planText, setPlanText] = useState("Start antihypertensive; follow-up in 2 weeks.");

  // Attachment
  const [attachmentBase64, setAttachmentBase64] = useState(null);
  const [attachmentMime, setAttachmentMime] = useState(null);
  const fileRef = useRef();

  // UI state
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* ----------------- Handlers ----------------- */
  const handlePractitionerChange = (e) =>
    setPractitioner({ ...practitioner, [e.target.name]: e.target.value });
  const handlePatientChange = (e) =>
    setPatient({ ...patient, [e.target.name]: e.target.value });
  const handleCompositionChange = (e) =>
    setComposition({ ...composition, [e.target.name]: e.target.value });
  const handleConditionChange = (e) =>
    setCondition({ ...condition, [e.target.name]: e.target.value });

  function updateListItem(setter, list, idx, field, value) {
    const copy = [...list];
    copy[idx][field] = value;
    setter(copy);
  }
  function addListItem(setter, list, template) {
    setter([...list, { ...template, id: uuidv4() }]);
  }
  function removeListItem(setter, list, idx) {
    if (list.length <= 1) return;
    const copy = [...list];
    copy.splice(idx, 1);
    setter(copy);
  }

  function handleFile(file) {
    if (!file) {
      setAttachmentBase64(null);
      setAttachmentMime(null);
      return;
    }
    // Accept only PDF/JPEG/PNG
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      alert("Only PDF / JPG / PNG attachments allowed.");
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
  }

  /* ----------------- Build Bundle ----------------- */
  function buildBundle() {
    // Basic front-end checks
    if (!practitioner.name || !practitioner.license)
      throw new Error("Practitioner name and license required.");
    if (!patient.name || !patient.mrn || !patient.gender)
      throw new Error("Patient name, MRN and gender required.");
    if (!composition.title || !composition.date)
      throw new Error("Composition title and date required.");
    if (!condition.text) throw new Error("Primary diagnosis text is required.");

    // Generate IDs
    const compId = uuidv4();
    const patientId = uuidv4();
    const practitionerId = uuidv4();
    const conditionId = uuidv4();
    const chiefIds = chiefComplaints.map(() => uuidv4());
    const examIds = physicalExams.map(() => uuidv4());
    const allergyIds = allergies.map(() => uuidv4());
    const medIds = medications.map(() => uuidv4());
    const binaryId = uuidv4();

    const bundle = {
      resourceType: "Bundle",
      id: `Consultation-${uuidv4()}`,
      meta: {
        versionId: "1",
        lastUpdated: getISOWithOffsetFromDateInput(),
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle",
        ],
      },
      identifier: { system: "http://hip.in", value: uuidv4() },
      type: "document",
      timestamp: getISOWithOffsetFromDateInput(),
      entry: [],
    };

    /* Build composition sections dynamically (only include if non-empty) */
    const sections = [];

    if (chiefComplaints && chiefComplaints.length > 0) {
      const entries = chiefIds.map((id) => ({
        reference: `urn:uuid:${id}`,
        type: "Condition",
      }));
      sections.push({
        title: "Chief complaints",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "422843007",
              display: "Chief complaint section",
            },
          ],
        },
        entry: entries,
      });
    }

    if (physicalExams && physicalExams.length > 0) {
      const entries = examIds.map((id) => ({
        reference: `urn:uuid:${id}`,
        type: "Observation",
      }));
      sections.push({
        title: "Physical examination",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "425044008",
              display: "Physical exam section",
            },
          ],
        },
        entry: entries,
      });
    }

    if (allergies && allergies.length > 0) {
      const entries = allergyIds.map((id) => ({
        reference: `urn:uuid:${id}`,
        type: "AllergyIntolerance",
      }));
      sections.push({
        title: "Allergies",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "722446000",
              display: "Allergy record",
            },
          ],
        },
        entry: entries,
      });
    }

    if (medications && medications.length > 0) {
      const entries = medIds.map((id) => ({
        reference: `urn:uuid:${id}`,
        type: "MedicationStatement",
      }));
      sections.push({
        title: "Medications",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "721912009",
              display: "Medication summary document",
            },
          ],
        },
        entry: entries,
      });
    }

    const historyNarr = makeSectionNarrative("History", historyText);
    if (historyNarr) {
      sections.push({
        title: "History",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "371529009",
              display: "History and physical report",
            },
          ],
        },
        text: historyNarr,
      });
    }

    const invNarr = makeSectionNarrative(
      "Investigations / Advice",
      investigationsText
    );
    if (invNarr) {
      sections.push({
        title: "Investigations / Advice",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "721963009",
              display: "Order document",
            },
          ],
        },
        text: invNarr,
      });
    }

    const planNarr = makeSectionNarrative("Plan", planText);
    if (planNarr) {
      sections.push({
        title: "Plan",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "390906007",
              display: "Follow-up encounter",
            },
          ],
        },
        text: planNarr,
      });
    }

    if (attachmentBase64 && attachmentMime) {
      sections.push({
        title: "Attachments",
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "371530004",
              display: "Clinical consultation report",
            },
          ],
        },
        entry: [{ reference: `urn:uuid:${binaryId}`, type: "Binary" }],
      });
    }

    /* Composition resource */
    const compositionResource = {
      resourceType: "Composition",
      id: compId,
      meta: {
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/ConsultationRecord",
        ],
      },
      text: {
        status: "generated",
        div: buildNarrative(
          "Consultation Note",
          `<p>${composition.title}</p><p>Date: ${composition.date}</p>`
        ),
      },
      language: "en-IN",
      identifier: { system: "https://ndhm.in/phr", value: uuidv4() },
      status: composition.status || "final",
      type: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "371530004",
            display: "Clinical consultation report",
          },
        ],
        text: "Clinical consultation report",
      },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      date: `${composition.date}T00:00:00+05:30`,
      author: [{ reference: `urn:uuid:${practitionerId}`, display: practitioner.name }],
      title: composition.title,
      section: sections,
    }; // keeps your existing shape. :contentReference[oaicite:2]{index=2}

    /* Patient resource */
    const patientResource = {
      resourceType: "Patient",
      id: patientId,
      meta: {
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient",
        ],
      },
      text: {
        status: "generated",
        div: buildNarrative(
          "Patient",
          `<p>${patient.name}, DoB: ${patient.birthDate || ""}</p>`
        ),
      },
      identifier: [
        {
          type: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                code: "MR",
                display: "Medical record number",
              },
            ],
          },
          system: "https://healthid.ndhm.gov.in",
          value: patient.mrn,
        },
      ],
      name: [{ text: patient.name }],
      telecom: patient.phone
        ? [{ system: "phone", value: patient.phone, use: "home" }]
        : [],
      gender: patient.gender,
      birthDate: patient.birthDate || undefined,
    }; // unchanged from your file. :contentReference[oaicite:3]{index=3}

    /* Practitioner resource */
    const practitionerResource = {
      resourceType: "Practitioner",
      id: practitionerId,
      meta: {
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner",
        ],
      },
      text: {
        status: "generated",
        div: buildNarrative("Practitioner", `<p>${practitioner.name}</p>`),
      },
      identifier: [
        {
          type: {
            coding: [
              {
                system:
                  "http://terminology.hl7.org/CodeSystem/v2-0203",
                code: "MD",
                display: "Medical License number",
              },
            ],
          },
          system: "https://doctor.ndhm.gov.in",
          value: practitioner.license,
        },
      ],
      name: [{ text: practitioner.name }],
    }; // unchanged. :contentReference[oaicite:4]{index=4}

    /* Chief complaints -> Condition resources */
    const chiefResources = chiefComplaints.map((cc, idx) => {
      return {
        resourceType: "Condition",
        id: chiefIds[idx],
        meta: {
          profile: [
            "https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition",
          ],
        },
        text: {
          status: "generated",
          div: buildNarrative("Chief Complaint", `<p>${cc.text}</p>`),
        },
        clinicalStatus: {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/condition-clinical",
              code: "active",
              display: "Active",
            },
          ],
        },
        code: cc.text
          ? cc.code && cc.code.trim() !== ""
            ? {
                coding: [
                  {
                    system: "http://snomed.info/sct",
                    code: cc.code.trim(),
                    display: cc.text,
                  },
                ],
                text: cc.text,
              }
            : { text: cc.text }
          : undefined,
        subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      };
    });

    /* Exam observations */
    const examResources = physicalExams.map((ex, idx) => ({
      resourceType: "Observation",
      id: examIds[idx],
      meta: {
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation",
        ],
      },
      text: {
        status: "generated",
        div: buildNarrative("Examination", `<p>${ex.text}</p>`),
      },
      status: "final",
      code: { text: "Physical examination" },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      valueString: ex.text,
    }));

    /* Allergy resources */
    const allergyResources = allergies.map((a, idx) => ({
      resourceType: "AllergyIntolerance",
      id: allergyIds[idx],
      meta: {
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/AllergyIntolerance",
        ],
      },
      text: {
        status: "generated",
        div: buildNarrative("Allergy", `<p>${a.text}</p>`),
      },
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: "active",
            display: "Active",
          },
        ],
      },
      code: a.text ? { text: a.text } : undefined,
      patient: { reference: `urn:uuid:${patientId}`, display: patient.name },
    })); // unchanged. :contentReference[oaicite:5]{index=5}

    /* MedicationStatement resources */
    const medResources = medications.map((m, idx) => {
      const medObj = {
        resourceType: "MedicationStatement",
        id: medIds[idx],
        meta: {
          profile: [
            "https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationStatement",
          ],
        },
        text: {
          status: "generated",
          div: buildNarrative(
            "Medication",
            `<p>${m.medicationText} - ${m.note || ""}</p>`
          ),
        },
        status: "active",
        medicationCodeableConcept:
          m.medicationCode && m.medicationCode.trim() !== ""
            ? {
                coding: [
                  {
                    system: "http://snomed.info/sct",
                    code: m.medicationCode.trim(),
                    display: m.medicationText,
                  },
                ],
              }
            : { text: m.medicationText },
        subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
        ...(m.note && m.note.trim() !== "" ? { note: [{ text: m.note.trim() }] } : {}),
      };
      return medObj;
    }); // unchanged. :contentReference[oaicite:6]{index=6}

    /* Primary diagnosis (Condition) */
    const conditionResource = {
      resourceType: "Condition",
      id: conditionId,
      meta: {
        profile: [
          "https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition",
        ],
      },
      text: {
        status: "generated",
        div: buildNarrative("Diagnosis", `<p>${condition.text}</p>`),
      },
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: condition.clinicalStatus || "active",
            display: "Active",
          },
        ],
      },
      code:
        condition.code && String(condition.code).trim() !== ""
          ? {
              coding: [
                {
                  system: "http://snomed.info/sct",
                  code: condition.code.trim(),
                  display: condition.text,
                },
              ],
              text: condition.text,
            }
          : { text: condition.text },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
    };

    /* Binary resource only if file uploaded */
    let binaryResource = null;
    if (attachmentBase64 && attachmentMime) {
      binaryResource = {
        resourceType: "Binary",
        id: binaryId,
        meta: {
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Binary"],
        },
        contentType: attachmentMime,
        data: attachmentBase64,
      };
    }

    /* Compose bundle entries - stable order */
    bundle.entry.push({ fullUrl: `urn:uuid:${compId}`, resource: compositionResource });
    bundle.entry.push({ fullUrl: `urn:uuid:${patientId}`, resource: patientResource });
    bundle.entry.push({ fullUrl: `urn:uuid:${practitionerId}`, resource: practitionerResource });
    chiefResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    examResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    allergyResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    medResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    bundle.entry.push({ fullUrl: `urn:uuid:${conditionId}`, resource: conditionResource });
    if (binaryResource) {
      bundle.entry.push({ fullUrl: `urn:uuid:${binaryId}`, resource: binaryResource });
    }

    return bundle;
  } // end buildBundle

  /* ----------------- Submit handler ----------------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!practitioner.name || !practitioner.license) {
      setErrorMsg("Practitioner name and license are mandatory.");
      return;
    }
    if (!patient.name || !patient.mrn || !patient.gender) {
      setErrorMsg("Patient name, MRN and gender are mandatory.");
      return;
    }
    if (!composition.title || !composition.date) {
      setErrorMsg("Document title and date are mandatory.");
      return;
    }
    if (!condition.text) {
      setErrorMsg("Primary diagnosis text is mandatory.");
      return;
    }

    try {
      const bundle = buildBundle();
      console.log("JSON pushed on server:");
      console.log(pretty(bundle));
      setSuccessMsg("Consultation Note submitted and logged to console (pushed to server).");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to build bundle");
    }
  };

  /* ----------------- UI JSX ----------------- */
  return (
    <div className="container py-4">
      <h2 className="mb-3">OP Consultation Note — Builder</h2>

      {/* Practitioner */}
      <div className="card mb-3">
        <div className="card-header">1. Practitioner (You) <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Name <span className="text-danger">*</span></label>
              <input name="name" type="text" className="form-control" value={practitioner.name} onChange={handlePractitionerChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">License No. <span className="text-danger">*</span></label>
              <input name="license" type="text" className="form-control" value={practitioner.license} onChange={handlePractitionerChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Patient */}
      <div className="card mb-3">
        <div className="card-header">2. Patient Info <span className="text-danger">*</span></div>
        <div className="card-body">
          {/* Patient "API" dropdown */}
          <div className="row g-2 mb-2">
            <div className="col-md-8">
              <label className="form-label">Select Patient (mock API)</label>
              <select className="form-select" value={selectedPatientIdx < 0 ? "" : String(selectedPatientIdx)} onChange={handlePatientSelectFromList}>
                <option value="">-- Select patient --</option>
                {patientsList.map((p, i) => (
                  <option key={(p.user_ref_id || p.email || p.mobile || i) + "_opt"} value={i}>
                    {p.name} — {p.mobile || "no mobile"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Full Name <span className="text-danger">*</span></label>
              <input name="name" type="text" className="form-control" value={patient.name} onChange={handlePatientChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">MRN <span className="text-danger">*</span></label>
              <input name="mrn" type="text" className="form-control" value={patient.mrn} onChange={handlePatientChange} />
            </div>

            <div className="col-md-4 mt-2">
              <label className="form-label">Phone</label>
              <input name="phone" type="tel" className="form-control" value={patient.phone} onChange={handlePatientChange} />
            </div>
            <div className="col-md-4 mt-2">
              <label className="form-label">Gender <span className="text-danger">*</span></label>
              <select name="gender" className="form-select" value={patient.gender} onChange={handlePatientChange}>
                <option value="">--Select--</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="col-md-4 mt-2">
              <label className="form-label">Birth Date</label>
              <input name="birthDate" type="date" className="form-control" value={patient.birthDate} onChange={handlePatientChange} />
            </div>

            {/* ABHA UI (not used in bundle; for operator convenience) */}
            <div className="col-md-6 mt-2">
              <label className="form-label">ABHA Address</label>
              <select className="form-select" value={selectedAbha} onChange={(e) => setSelectedAbha(e.target.value)} disabled={abhaList.length === 0}>
                {abhaList.length === 0 ? (
                  <option value="">No ABHA addresses</option>
                ) : (
                  abhaList.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))
                )}
              </select>
            </div>
            <div className="col-md-6 mt-2">
              <label className="form-label">ABHA Number</label>
              <input type="text" className="form-control" value={selectedAbhaNumber} readOnly />
            </div>
          </div>
        </div>
      </div>

      {/* Composition */}
      <div className="card mb-3 border-primary">
        <div className="card-header bg-primary text-white">3. Document Info <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Title <span className="text-danger">*</span></label>
              <input name="title" type="text" className="form-control" value={composition.title} onChange={handleCompositionChange} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Status <span className="text-danger">*</span></label>
              <select name="status" className="form-select" value={composition.status} onChange={handleCompositionChange}>
                <option value="final">Final</option>
                <option value="preliminary">Preliminary</option>
                <option value="amended">Amended</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Date <span className="text-danger">*</span></label>
              <input name="date" type="date" className="form-control" value={composition.date} onChange={handleCompositionChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Diagnosis */}
      <div className="card mb-3">
        <div className="card-header">4. Primary Diagnosis <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Diagnosis Text <span className="text-danger">*</span></label>
              <input name="text" type="text" className="form-control" value={condition.text} onChange={handleConditionChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Diagnosis Code (SNOMED) <small className="text-muted">(optional)</small></label>
              <input name="code" type="text" className="form-control" value={condition.code} onChange={handleConditionChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Sections: chief, exam, allergies, meds */}
      <div className="card mb-3">
        <div className="card-header">5. Sections (add / edit)</div>
        <div className="card-body">
          {/* Chief complaints */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6>Chief Complaints</h6>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => addListItem(setChiefComplaints, chiefComplaints, { text: "" })}>+ Add</button>
            </div>
            {chiefComplaints.map((c, i) => (
              <div className="row g-2 align-items-center mb-2" key={c.id}>
                <div className="col-md-10">
                  <input className="form-control" value={c.text} onChange={(e) => updateListItem(setChiefComplaints, chiefComplaints, i, "text", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button type="button" className="btn btn-danger w-100" onClick={() => removeListItem(setChiefComplaints, chiefComplaints, i)} disabled={chiefComplaints.length === 1}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Physical examinations */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6>Physical Examinations</h6>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => addListItem(setPhysicalExams, physicalExams, { text: "" })}>+ Add</button>
            </div>
            {physicalExams.map((p, i) => (
              <div className="row g-2 align-items-center mb-2" key={p.id}>
                <div className="col-md-10">
                  <input className="form-control" value={p.text} onChange={(e) => updateListItem(setPhysicalExams, physicalExams, i, "text", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button type="button" className="btn btn-danger w-100" onClick={() => removeListItem(setPhysicalExams, physicalExams, i)} disabled={physicalExams.length === 1}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Allergies */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6>Allergies</h6>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => addListItem(setAllergies, allergies, { text: "" })}>+ Add</button>
            </div>
            {allergies.map((a, i) => (
              <div className="row g-2 align-items-center mb-2" key={a.id}>
                <div className="col-md-10">
                  <input className="form-control" value={a.text} onChange={(e) => updateListItem(setAllergies, allergies, i, "text", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button type="button" className="btn btn-danger w-100" onClick={() => removeListItem(setAllergies, allergies, i)} disabled={allergies.length === 1}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Medications */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6>Medications</h6>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => addListItem(setMedications, medications, { medicationText: "", medicationCode: "", note: "" })}>+ Add</button>
            </div>
            {medications.map((m, i) => (
              <div className="row g-2 align-items-center mb-2" key={m.id}>
                <div className="col-md-5">
                  <input className="form-control" placeholder="Drug name" value={m.medicationText} onChange={(e) => updateListItem(setMedications, medications, i, "medicationText", e.target.value)} />
                </div>
                <div className="col-md-3">
                  <input className="form-control" placeholder="SNOMED code (optional)" value={m.medicationCode} onChange={(e) => updateListItem(setMedications, medications, i, "medicationCode", e.target.value)} />
                </div>
                <div className="col-md-3">
                  <input className="form-control" placeholder="Note / dose" value={m.note} onChange={(e) => updateListItem(setMedications, medications, i, "note", e.target.value)} />
                </div>
                <div className="col-md-1">
                  <button type="button" className="btn btn-danger w-100" onClick={() => removeListItem(setMedications, medications, i)} disabled={medications.length === 1}>X</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Attachment */}
      <div className="card mb-3">
        <div className="card-header">6. Attachments (optional)</div>
        <div className="card-body">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="form-control"
            ref={fileRef}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {/* Submit */}
      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      <div className="mb-5">
        <button className="btn btn-primary" onClick={handleSubmit}>Submit</button>
      </div>
    </div>
  );
}
