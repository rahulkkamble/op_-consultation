// src/AppConsult.js
import React, { useState, useRef } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

/* Lightweight uuid generator for client-side IDs (ok for UI use) */
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
    // combine date with midnight to produce dateTime (keeps local timezone)
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
const pretty = (o) => JSON.stringify(o, null, 2);

/* Small helper for minimal narrative XHTML for Resource.text.div */

function buildNarrative(title, html) {
  // ensure required xmlns
  return `<div xmlns="http://www.w3.org/1999/xhtml"><h3>${title}</h3>${html}</div>`;
}

/* Format date-only YYYY-MM-DD (for authoredOn fields that require only date) */
function formatDateOnly(d) {
  if (!d) return "";
  if (d.indexOf("T") !== -1) return d.split("T")[0];
  return d;
}

export default function AppConsult() {
  // Practitioner (author)
  const [practitioner, setPractitioner] = useState({
    name: "Dr. DEF",
    license: "MD-12345-6789",
  });

  // Patient
  const [patient, setPatient] = useState({
    name: "ABC",
    mrn: "MR-001-2025",
    birthDate: "1985-04-12",
    gender: "male",
    phone: "+911234567890",
  });

  // Composition metadata (some fields auto-set)
  const [composition, setComposition] = useState({
    title: "OP Consultation Note",
    status: "final",
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  });

  // Condition / Diagnosis (single primary diagnosis)
  const [condition, setCondition] = useState({
    text: "Hypertension",
    code: "38341003", // SNOMED example
    clinicalStatus: "active",
  });

  // Dynamic sections: arrays of simple strings (allow multiple entries)
  const [chiefComplaints, setChiefComplaints] = useState([
    { id: uuidv4(), text: "Headache for 3 days" },
  ]);
  const [physicalExams, setPhysicalExams] = useState([
    { id: uuidv4(), text: "BP: 150/90 mmHg" },
  ]);
  const [allergies, setAllergies] = useState([{ id: uuidv4(), text: "None" }]);

  // medications as list (MedicationStatement)
  const [medications, setMedications] = useState([
    {
      id: uuidv4(),
      medicationText: "Amlodipine 5 mg",
      medicationCode: "", // optional SNOMED code
      note: "Once daily",
    },
  ]);

  // optional sections toggles (collapsed by default)
  const [showOptional, setShowOptional] = useState({
    history: false,
    exams: true,
    allergies: false,
    meds: true,
    others: false,
  });

  // history, investigations, plan text fields
  const [historyText, setHistoryText] = useState("Patient with episodic headaches.");
  const [investigations, setInvestigations] = useState("");
  const [planText, setPlanText] = useState("Start antihypertensive; follow-up in 2 weeks.");

  // attachment / signature
  const [attachmentBase64, setAttachmentBase64] = useState(null);
  const [attachmentMime, setAttachmentMime] = useState(null);
  const fileRef = useRef();

  // UI messages
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* --- Handlers for simple inputs --- */
  const handlePractitionerChange = (e) => setPractitioner({ ...practitioner, [e.target.name]: e.target.value });
  const handlePatientChange = (e) => setPatient({ ...patient, [e.target.name]: e.target.value });
  const handleCompositionChange = (e) => setComposition({ ...composition, [e.target.name]: e.target.value });
  const handleConditionChange = (e) => setCondition({ ...condition, [e.target.name]: e.target.value });

  /* --- Dynamic list helpers --- */
  function updateListItem(setter, list, idx, field, value) {
    const copy = [...list];
    copy[idx][field] = value;
    setter(copy);
  }
  function addListItem(setter, list, template = { id: uuidv4(), text: "" }) {
    setter([...list, { ...template, id: uuidv4() }]);
  }
  function removeListItem(setter, list, idx) {
    if (list.length === 1) return; // keep at least one entry
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
    // Only allow PDF/JPEG/PNG
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

  /* --- Build the Consultation Bundle --- */
  function buildBundle() {
    // Basic validation (will be rechecked in handleSubmit)
    if (!practitioner.name || !practitioner.license) throw new Error("Practitioner name and license are required.");
    if (!patient.name || !patient.mrn || !patient.gender) throw new Error("Patient name, MRN and gender are required.");
    if (!composition.title || !composition.date) throw new Error("Composition title and date required.");
    if (!condition.text) throw new Error("Primary diagnosis is required.");

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
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"],
      },
      identifier: { system: "http://hip.in", value: uuidv4() },
      type: "document",
      timestamp: getISOWithOffsetFromDateInput(),
      entry: [],
    };

    /* Composition */
    // Composition.type fixed values per profile: SNOMED 371530004
    const compositionResource = {
      resourceType: "Composition",
      id: compId,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/ConsultationRecord"],
      },
      text: {
        status: "generated",
        div: buildNarrative("Consultation Note", `<p>${composition.title}</p><p>Date: ${composition.date}</p>`),
      },
      language: "en-IN",
      identifier: { system: "https://ndhm.in/phr", value: uuidv4() },
      status: composition.status || "final",
      type: {
        coding: [{ system: "http://snomed.info/sct", code: "371530004", display: "Clinical consultation report" }],
        text: "Clinical consultation report",
      },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      date: `${composition.date}T00:00:00+05:30`,
      author: [{ reference: `urn:uuid:${practitionerId}`, display: practitioner.name }],
      title: composition.title,
      section: [
        // Chief complaints section
        {
          title: "Chief complaints",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "422843007", display: "Chief complaint section" }],
          },
          entry: chiefIds.map((id) => ({ reference: `urn:uuid:${id}`, type: "Condition" })),
        },
        // Physical Examination
        {
          title: "Physical examination",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "425044008", display: "Physical exam section" }],
          },
          entry: examIds.map((id) => ({ reference: `urn:uuid:${id}`, type: "Observation" })),
        },
        // Allergies
        {
          title: "Allergies",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "722446000", display: "Allergy record" }],
          },
          entry: allergyIds.map((id) => ({ reference: `urn:uuid:${id}`, type: "AllergyIntolerance" })),
        },
        // Medications
        {
          title: "Medications",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "721912009", display: "Medication summary document" }],
          },
          entry: medIds.map((id) => ({ reference: `urn:uuid:${id}`, type: "MedicationStatement" })),
        },
        // Other sections (History, Investigations, Plan) are included as narrative-only sections
        {
          title: "History",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "371529009", display: "History and physical report" }],
          },
          text: historyText
            ? {
              status: "generated",
              div: buildNarrative("History", `<p>${historyText}</p>`),
            }
            : undefined
        },
        {
          title: "Investigations / Advice",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "721963009", display: "Order document" }],
          },
          entry: [],
        },
        {
          title: "Plan",
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "390906007", display: "Follow-up encounter" }],
          },
          entry: [],
        },
        // DocumentReference / Attachment will be appended conditionally
        ...(attachmentBase64 && attachmentMime ? [{ title: "Attachments", entry: [{ reference: `urn:uuid:${binaryId}`, type: "Binary" }] }] : []),
      ],
    };

    /* Patient resource */
    const patientResource = {
      resourceType: "Patient",
      id: patientId,
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"] },
      text: { status: "generated", div: buildNarrative("Patient", `<p>${patient.name}, DoB: ${patient.birthDate}</p>`) },
      identifier: [
        {
          type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR", display: "Medical record number" }] },
          system: "https://healthid.ndhm.gov.in",
          value: patient.mrn,
        },
      ],
      name: [{ text: patient.name }],
      telecom: patient.phone ? [{ system: "phone", value: patient.phone, use: "home" }] : [],
      gender: patient.gender,
      birthDate: patient.birthDate || undefined,
    };

    /* Practitioner resource */
    const practitionerResource = {
      resourceType: "Practitioner",
      id: practitionerId,
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner"] },
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

    /* Chief complaints as Condition resources (simple) */
    const chiefResources = chiefComplaints.map((cc, idx) => ({
      resourceType: "Condition",
      id: chiefIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition"] },
      text: { status: "generated", div: buildNarrative("Chief Complaint", `<p>${cc.text}</p>`) },
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active", display: "Active" }] },
      code: { coding: [{ system: "http://snomed.info/sct", code: "", display: cc.text }], text: cc.text },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
    }));

    /* Physical exam observations */
    const examResources = physicalExams.map((ex, idx) => ({
      resourceType: "Observation",
      id: examIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"] },
      text: { status: "generated", div: buildNarrative("Examination", `<p>${ex.text}</p>`) },
      status: "final",
      code: { text: "Physical examination" },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      valueString: ex.text,
    }));

    /* Allergies (AllergyIntolerance resources) */
    const allergyResources = allergies.map((a, idx) => ({
      resourceType: "AllergyIntolerance",
      id: allergyIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/AllergyIntolerance"] },
      text: { status: "generated", div: buildNarrative("Allergy", `<p>${a.text}</p>`) },
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active", display: "Active" }] },
      code: { text: a.text },
      patient: { reference: `urn:uuid:${patientId}`, display: patient.name },
    }));

    /* Medications as MedicationStatement resources (simple) */
    const medResources = medications.map((m, idx) => ({
      resourceType: "MedicationStatement",
      id: medIds[idx],
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationStatement"] },
      text: {
        status: "generated", div: buildNarrative("Medication", `<p>${m.medicationText} - ${m.note && m.note.trim() !== ""
          ? [{ text: m.note.trim() }]
          : undefined}</p>`)
      },
      status: "active",
      medicationCodeableConcept:
        m.medicationCode && m.medicationCode.trim() !== ""
          ? { coding: [{ system: "http://snomed.info/sct", code: m.medicationCode.trim(), display: m.medicationText }] }
          : { text: m.medicationText },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
      note: m.note ? [{ text: m.note }] : undefined
    }));

    /* Condition resource for primary diagnosis */
    const conditionResource = {
      resourceType: "Condition",
      id: conditionId,
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition"] },
      text: { status: "generated", div: buildNarrative("Diagnosis", `<p>${condition.text}</p>`) },
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: condition.clinicalStatus || "active", display: "Active" }] },
      code: condition.code && condition.code.trim() !== ""
        ? { coding: [{ system: "http://snomed.info/sct", code: condition.code.trim(), display: condition.text }], text: condition.text } : { text: condition.text },
      subject: { reference: `urn:uuid:${patientId}`, display: patient.name },
    };

    /* Optional Binary */
    let binaryResource = null;
    if (attachmentBase64 && attachmentMime) {
      binaryResource = {
        resourceType: "Binary",
        id: binaryId,
        meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Binary"] },
        contentType: attachmentMime,
        data: attachmentBase64,
      };
    }

    /* Compose bundle entries in order */
    bundle.entry.push({ fullUrl: `urn:uuid:${compId}`, resource: compositionResource });
    bundle.entry.push({ fullUrl: `urn:uuid:${patientId}`, resource: patientResource });
    bundle.entry.push({ fullUrl: `urn:uuid:${practitionerId}`, resource: practitionerResource });

    // add chief complaints, exams, allergies, meds, condition in a stable order
    chiefResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    examResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    allergyResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
    medResources.forEach((r) => bundle.entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r }));

    // primary diagnosis
    bundle.entry.push({ fullUrl: `urn:uuid:${conditionId}`, resource: conditionResource });

    if (binaryResource) {
      bundle.entry.push({ fullUrl: `urn:uuid:${binaryId}`, resource: binaryResource });
      // ensure composition references binary in same composition.section (already appended above)
    }

    return bundle;
  }

  /* --- Submit handler --- */
  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    // Front-end required validation
    if (!practitioner.name || !practitioner.license) {
      setErrorMsg("Practitioner name and license are mandatory.");
      return;
    }
    if (!patient.name || !patient.mrn || !patient.gender) {
      setErrorMsg("Patient name, MRN and gender are mandatory.");
      return;
    }
    if (!composition.title || !composition.date) {
      setErrorMsg("Composition title and date are required.");
      return;
    }
    if (!condition.text) {
      setErrorMsg("Primary diagnosis is mandatory.");
      return;
    }

    try {
      const bundle = buildBundle();
      console.log("JSON pushed on server");
      console.log(pretty(bundle));
      setSuccessMsg("Form submitted successfully!");
      // Auto-clear success notice after 3s
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to build bundle");
    }
  };

  /* --- JSX UI --- */
  return (
    <div className="container py-4">
      <h2 className="mb-3">OP Consultation Note — Builder</h2>

      {/* Practitioner card */}
      <div className="card mb-3">
        <div className="card-header">1. Practitioner (Author) <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Name <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="name" value={practitioner.name} onChange={handlePractitionerChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Medical License <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="license" value={practitioner.license} onChange={handlePractitionerChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Patient card */}
      <div className="card mb-3">
        <div className="card-header">2. Patient Info <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Full Name <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="name" value={patient.name} onChange={handlePatientChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">MRN <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="mrn" value={patient.mrn} onChange={handlePatientChange} />
            </div>

            <div className="col-md-4 mt-2">
              <label className="form-label">Phone</label>
              <input type="tel" className="form-control" name="phone" value={patient.phone} onChange={handlePatientChange} />
            </div>
            <div className="col-md-4 mt-2">
              <label className="form-label">Gender <span className="text-danger">*</span></label>
              <select className="form-select" name="gender" value={patient.gender} onChange={handlePatientChange}>
                <option value="">--Select--</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="col-md-4 mt-2">
              <label className="form-label">Birth Date</label>
              <input type="date" className="form-control" name="birthDate" value={patient.birthDate} onChange={handlePatientChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Composition card */}
      <div className="card mb-3 border-primary">
        <div className="card-header bg-primary text-white">3. Document / Composition Info <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Title <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="title" value={composition.title} onChange={handleCompositionChange} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Status <span className="text-danger">*</span></label>
              <select className="form-select" name="status" value={composition.status} onChange={handleCompositionChange}>
                <option value="final">Final</option>
                <option value="preliminary">Preliminary</option>
                <option value="amended">Amended</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Date <span className="text-danger">*</span></label>
              <input type="date" className="form-control" name="date" value={composition.date} onChange={handleCompositionChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Primary Diagnosis */}
      <div className="card mb-3">
        <div className="card-header">4. Primary Diagnosis <span className="text-danger">*</span></div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Diagnosis Text <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="text" value={condition.text} onChange={handleConditionChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Diagnosis Code (SNOMED) <small className="text-muted">(optional)</small></label>
              <input type="text" className="form-control" name="code" value={condition.code} onChange={handleConditionChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Sections — dynamic lists and optional toggles */}
      <div className="card mb-3">
        <div className="card-header">5. Sections (add / edit)</div>
        <div className="card-body">
          {/* Chief complaints */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <h6>Chief Complaints</h6>
              <div>
                <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => addListItem(setChiefComplaints, chiefComplaints, { id: uuidv4(), text: "" })}>+ Add</button>
              </div>
            </div>
            {chiefComplaints.map((c, i) => (
              <div className="row g-2 align-items-center mb-2" key={c.id}>
                <div className="col-md-10">
                  <input className="form-control" value={c.text} onChange={(e) => updateListItem(setChiefComplaints, chiefComplaints, i, "text", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button className="btn btn-danger w-100" onClick={() => removeListItem(setChiefComplaints, chiefComplaints, i)} disabled={chiefComplaints.length === 1}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Physical examinations */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <h6>Physical Examinations</h6>
              <div>
                <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => addListItem(setPhysicalExams, physicalExams, { id: uuidv4(), text: "" })}>+ Add</button>
              </div>
            </div>
            {physicalExams.map((p, i) => (
              <div className="row g-2 align-items-center mb-2" key={p.id}>
                <div className="col-md-10">
                  <input className="form-control" value={p.text} onChange={(e) => updateListItem(setPhysicalExams, physicalExams, i, "text", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button className="btn btn-danger w-100" onClick={() => removeListItem(setPhysicalExams, physicalExams, i)} disabled={physicalExams.length === 1}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Allergies */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <h6>Allergies</h6>
              <div>
                <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => addListItem(setAllergies, allergies, { id: uuidv4(), text: "" })}>+ Add</button>
              </div>
            </div>
            {allergies.map((a, i) => (
              <div className="row g-2 align-items-center mb-2" key={a.id}>
                <div className="col-md-10">
                  <input className="form-control" value={a.text} onChange={(e) => updateListItem(setAllergies, allergies, i, "text", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button className="btn btn-danger w-100" onClick={() => removeListItem(setAllergies, allergies, i)} disabled={allergies.length === 1}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Medications */}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <h6>Medications</h6>
              <div>
                <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => addListItem(setMedications, medications, { id: uuidv4(), medicationText: "", medicationCode: "", note: "" })}>+ Add</button>
              </div>
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
                  <input className="form-control" placeholder="Note / dose" value={m.note && m.note.trim() !== ""
                    ? [{ text: m.note.trim() }] : undefined} onChange={(e) => updateListItem(setMedications, medications, i, "note", e.target.value)} />
                </div>
                <div className="col-md-1">
                  <button className="btn btn-danger w-100" onClick={() => removeListItem(setMedications, medications, i)} disabled={medications.length === 1}>X</button>
                </div>
              </div>
            ))}
          </div>

          {/* History / Investigations / Plan textareas */}
          <div className="mb-3">
            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label">History (optional)</label>
                <textarea className="form-control" rows="3" value={historyText} onChange={(e) => setHistoryText(e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Investigations / Advice (optional)</label>
                <textarea className="form-control" rows="3" value={investigations} onChange={(e) => setInvestigations(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Plan (optional)</label>
            <textarea className="form-control" rows="2" value={planText} onChange={(e) => setPlanText(e.target.value)} />
          </div>

          <div className="mb-3">
            <label className="form-label">Attachment (optional)</label>
            <input type="file" className="form-control" ref={fileRef} onChange={(e) => handleFile(e.target.files[0])} />
            <small className="text-muted">Allowed: PDF, JPG, PNG — Binary will be included only if uploaded.</small>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4">
        <button className="btn btn-primary me-2" onClick={handleSubmit}>Submit</button>
        {errorMsg && <div className="alert alert-danger mt-2">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success mt-2">{successMsg}</div>}
      </div>
    </div>
  );
}
