const API_URL = "http://localhost:5000/api";
let isBackendOnline = false;

// Global Chart references for recycling
let contractChart = null;
let internetChart = null;
let rocChart = null;
let importanceChart = null;

// Tab Navigation
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageTitle = document.getElementById('page-title');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = item.getAttribute('data-tab');
        
        // Update active class on nav
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Show active tab pane
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            if (pane.id === `tab-${tabName}`) {
                pane.classList.add('active');
            }
        });
        
        // Update header title
        pageTitle.textContent = item.querySelector('span').textContent;
        
        // Trigger chart resize if navigating to tab with charts
        if (tabName === 'overview') {
            if (contractChart) contractChart.resize();
            if (internetChart) internetChart.resize();
        } else if (tabName === 'models') {
            if (rocChart) rocChart.resize();
            if (importanceChart) importanceChart.resize();
        }
    });
});

// Check Backend Health
async function checkHealth() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        
            if (data.status === 'healthy') {
                dot.className = 'status-indicator online';
                text.textContent = "Backend: Connected";

                // Only initialize dashboard when required artifacts are present
                const artifacts = data.artifacts_loaded || {};
                if (!isBackendOnline && (artifacts.model && artifacts.metrics)) {
                    isBackendOnline = true;
                    initializeDashboard();
                } else {
                    // Mark backend online even if artifacts are not yet ready
                    isBackendOnline = true;
                }
            } else {
            throw new Error("Backend reported unhealthy status");
        }
    } catch (error) {
        dot.className = 'status-indicator offline';
        text.textContent = "Backend: Disconnected";
        isBackendOnline = false;
    }
}

// Initial Call & Interval
checkHealth();
setInterval(checkHealth, 5000);

// Initialize Dashboard Data
async function initializeDashboard() {
    if (!isBackendOnline) return;
    
    try {
        // Fetch EDA Summary
        const summaryRes = await fetch(`${API_URL}/summary`);
        if (summaryRes.ok) {
            const summary = await summaryRes.json();
            if (summary) populateEDA(summary);
        }
        
        // Fetch Model Metrics
        const metricsRes = await fetch(`${API_URL}/metrics`);
        if (metricsRes.ok) {
            const metrics = await metricsRes.json();
            populateMetrics(metrics);
        }
    } catch (e) {
        console.error("Error initializing dashboard data:", e);
    }
}

// Populate EDA Dashboard Tab
function populateEDA(data) {
    // KPI Cards
    document.getElementById('kpi-total').textContent = Number(data.total_customers).toLocaleString();
    document.getElementById('kpi-churn').textContent = (data.churn_rate * 100).toFixed(1) + '%';
    document.getElementById('kpi-tenure').textContent = data.avg_tenure.toFixed(1) + ' mos';
    document.getElementById('kpi-charges').textContent = '$' + data.avg_monthly_charges.toFixed(2);
    
    // Chart 1: Contract Distribution
    const ctxContract = document.getElementById('chart-contract').getContext('2d');
    if (contractChart) contractChart.destroy();
    
    const contractLabels = Object.keys(data.contract_split);
    const contractValues = Object.values(data.contract_split).map(v => Number((v * 100).toFixed(1)));
    
    contractChart = new Chart(ctxContract, {
        type: 'bar',
        data: {
            labels: contractLabels,
            datasets: [{
                label: 'Percentage of Customers (%)',
                data: contractValues,
                backgroundColor: ['rgba(59, 130, 246, 0.65)', 'rgba(139, 92, 246, 0.65)', 'rgba(16, 185, 129, 0.65)'],
                borderColor: ['#3b82f6', '#8b5cf6', '#10b981'],
                borderWidth: 1.5,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw}%` } }
            },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });

    // Chart 2: Internet Service split
    const ctxInternet = document.getElementById('chart-internet').getContext('2d');
    if (internetChart) internetChart.destroy();
    
    const internetLabels = Object.keys(data.internet_split);
    const internetValues = Object.values(data.internet_split).map(v => Number((v * 100).toFixed(1)));
    
    internetChart = new Chart(ctxInternet, {
        type: 'doughnut',
        data: {
            labels: internetLabels,
            datasets: [{
                data: internetValues,
                backgroundColor: ['rgba(239, 68, 68, 0.65)', 'rgba(59, 130, 246, 0.65)', 'rgba(100, 116, 139, 0.65)'],
                borderColor: ['#ef4444', '#3b82f6', '#64748b'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc', padding: 15, font: { family: 'Outfit' } } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}%` } }
            },
            cutout: '70%'
        }
    });
}

// Populate Metrics Tab
function populateMetrics(data) {
    const bestModel = data.best_model_name;
    document.getElementById('best-model-badge').textContent = bestModel;
    
    // Metrics Table
    const tbody = document.getElementById('metrics-table-body');
    tbody.innerHTML = '';
    
    Object.entries(data.metrics).forEach(([name, m]) => {
        const tr = document.createElement('tr');
        if (name === bestModel) {
            tr.className = 'best-row';
        }
        
        tr.innerHTML = `
            <td>${name} ${name === bestModel ? '<i class="fa-solid fa-trophy text-amber-400" title="Best Model" style="color: #f59e0b; margin-left: 6px;"></i>' : ''}</td>
            <td>${(m.accuracy * 100).toFixed(1)}%</td>
            <td>${(m.precision * 100).toFixed(1)}%</td>
            <td>${(m.recall * 100).toFixed(1)}%</td>
            <td>${(m.f1_score * 100).toFixed(1)}%</td>
            <td><strong>${m.roc_auc.toFixed(3)}</strong></td>
        `;
        tbody.appendChild(tr);
    });

    // Chart 3: ROC Curves
    const ctxRoc = document.getElementById('chart-roc').getContext('2d');
    if (rocChart) rocChart.destroy();
    
    // Build datasets for each model
    const colors = {
        LogisticRegression: '#8b5cf6',
        RandomForest: '#10b981',
        XGBoost: '#3b82f6'
    };
    
    const datasets = Object.entries(data.metrics).map(([name, m]) => {
        const points = m.roc_curve.fpr.map((fprVal, idx) => ({
            x: fprVal,
            y: m.roc_curve.tpr[idx]
        }));
        
        return {
            label: name,
            data: points,
            borderColor: colors[name] || '#64748b',
            borderWidth: name === bestModel ? 3 : 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.1
        };
    });
    
    // Add baseline diagonal line
    datasets.push({
        label: 'Random Guess',
        data: [{x: 0, y: 0}, {x: 1, y: 1}],
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderDash: [5, 5],
        borderWidth: 1,
        pointRadius: 0,
        fill: false
    });
    
    rocChart = new Chart(ctxRoc, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Outfit' } } }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: 'False Positive Rate (FPR)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 1
                },
                y: {
                    title: { display: true, text: 'True Positive Rate (TPR)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 1
                }
            }
        }
    });

    // Chart 4: Feature Importance
    const ctxImportance = document.getElementById('chart-importance').getContext('2d');
    if (importanceChart) importanceChart.destroy();
    
    const impLabels = data.feature_importances.map(item => cleanFeatureName(item.feature));
    const impValues = data.feature_importances.map(item => item.importance);
    
    importanceChart = new Chart(ctxImportance, {
        type: 'bar',
        data: {
            labels: impLabels,
            datasets: [{
                label: 'Relative Importance Score',
                data: impValues,
                backgroundColor: 'rgba(59, 130, 246, 0.55)',
                borderColor: '#3b82f6',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { display: false }, ticks: { color: '#f8fafc', font: { size: 11, family: 'Outfit' } } }
            }
        }
    });
}

// Clean up ugly feature names from ML preprocessor
function cleanFeatureName(name) {
    if (!name) return "";
    
    // Replace underscores with space and clean up
    let clean = name;
    if (name.includes("_")) {
        const parts = name.split("_");
        clean = `${parts[0]} [${parts[1]}]`;
    }
    
    // Capitalize words nicely
    clean = clean.replace(/([A-Z])/g, ' $1').trim();
    clean = clean.replace("Senior Citizen", "Senior Citizen (Yes/No)");
    clean = clean.replace("tenure", "Tenure (Months)");
    clean = clean.replace("Monthly Charges", "Monthly Charges ($)");
    clean = clean.replace("Total Charges", "Total Charges ($)");
    clean = clean.replace("Num Services", "Number of Active Services");
    
    return clean;
}

// Predictor Form Inputs: Auto-Calculate Total Charges
document.getElementById('btn-calc-total').addEventListener('click', () => {
    const tenure = parseInt(document.getElementById('tenure').value) || 0;
    const monthly = parseFloat(document.getElementById('MonthlyCharges').value) || 0;
    document.getElementById('TotalCharges').value = (tenure * monthly).toFixed(2);
});

// Form Submission & Prediction API call
const form = document.getElementById('churn-form');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isBackendOnline) {
        alert("Backend API is currently offline. Please start the server and try again.");
        return;
    }
    
    const btnPredict = document.getElementById('btn-predict');
    btnPredict.disabled = true;
    btnPredict.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
    
    // Collect Form Data
    const formData = new FormData(form);
    const payload = {};
    formData.forEach((value, key) => {
        // Convert numeric fields
        if (['SeniorCitizen', 'tenure', 'MonthlyCharges', 'TotalCharges'].includes(key)) {
            payload[key] = parseFloat(value);
        } else {
            payload[key] = value;
        }
    });
    
    try {
        // 1. Fetch Predict Endpoint
        const predictRes = await fetch(`${API_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!predictRes.ok) {
            const errText = await predictRes.text();
            throw new Error(errText || "Prediction failed");
        }
        const predictData = await predictRes.json();
        console.log("Before Firestore");

await db.collection("predictions").add({
    ...payload,
    churn_probability: predictData.churn_probability,
    prediction: predictData.prediction_label,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
});

console.log("Prediction saved to Firestore");

// 2. Fetch SHAP Explanations
const explainRes = await fetch(`${API_URL}/explain`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});

if (!explainRes.ok) {
    const errText = await explainRes.text();
    throw new Error(errText || "SHAP calculation failed");
}

const explainData = await explainRes.json();
        
        // Show cards
        document.getElementById('result-container').classList.remove('hide');
        document.getElementById('shap-container').classList.remove('hide');
        
        renderPrediction(predictData, payload);
        renderSHAP(explainData);
        
        // Scroll results card into view on mobile
        document.getElementById('result-container').scrollIntoView({ behavior: 'smooth' });
        
    } catch (err) {
        alert("Error generating prediction: " + err.message);
    } finally {
        btnPredict.disabled = false;
        btnPredict.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Predict Churn Risk';
    }
});

// Render Risk Output Gauge & Custom Text
function renderPrediction(res, input) {
    const prob = res.churn_probability;
    const pct = (prob * 100).toFixed(1);
    
    // Update score text
    document.getElementById('risk-score').textContent = `${pct}%`;
    
    // Update Semicircle Svg (circumference is 125.6, offset starts at 125.6 and goes down to 0)
    const strokeOffset = 125.6 - (125.6 * prob);
    const gaugeFill = document.getElementById('gauge-fill');
    gaugeFill.style.strokeDashoffset = strokeOffset;
    
    // Color and status badge
    const badge = document.getElementById('risk-status');
    let riskClass = "";
    let riskLabel = "";
    let recMsg = "";
    
    if (prob < 0.3) {
        riskClass = "risk-badge low";
        riskLabel = "LOW RISK";
        gaugeFill.setAttribute('stroke', 'var(--color-success)');
        recMsg = `This customer shows high engagement. With a tenure of ${input.tenure} months, their contract type (${input.Contract}) remains secure. Recommend regular marketing communication to maintain satisfaction.`;
    } else if (prob < 0.65) {
        riskClass = "risk-badge medium";
        riskLabel = "MODERATE RISK";
        gaugeFill.setAttribute('stroke', 'var(--color-warning)');
        recMsg = `Warning signs detected. Churn probability is elevated. Since their contract is <strong>${input.Contract}</strong>, consider pitching a discount incentive to upgrade to a <strong>1-year or 2-year contract</strong> to lock in stability.`;
    } else {
        riskClass = "risk-badge high";
        riskLabel = "HIGH RISK";
        gaugeFill.setAttribute('stroke', 'var(--color-danger)');
        
        // Custom rule-based advisory lines depending on input
        let factors = [];
        if (input.Contract === 'Month-to-month') factors.push("Month-to-month contract terms");
        if (input.InternetService === 'Fiber optic') factors.push("High Fiber-optic service billing");
        if (input.TechSupport === 'No') factors.push("Lack of Tech Support services");
        if (input.tenure < 6) factors.push("Early-stage tenure (< 6 months)");
        
        recMsg = `<strong>Urgent Retention Intervention Recommended!</strong> Churn risk is critical. Primary risk drivers include: ${factors.join(', ')}. <br><br><strong>Action:</strong> Reach out immediately via customer support to offer free Tech Support addons or a 15% loyalty discount on an annual contract.`;
    }
    
    badge.className = riskClass;
    badge.textContent = riskLabel;
    document.getElementById('recommendation-msg').innerHTML = recMsg;
}

// Render local SHAP explanations list
function renderSHAP(data) {
    const listContainer = document.getElementById('shap-list');
    listContainer.innerHTML = '';
    
    const contributions = data.contributions;
    
    // Find the max absolute SHAP value to normalize bar widths
    let maxVal = 0.01;
    contributions.forEach(c => {
        if (Math.abs(c.shap_value) > maxVal) {
            maxVal = Math.abs(c.shap_value);
        }
    });
    
    contributions.forEach(c => {
        const val = c.shap_value;
        const raw = c.raw_value;
        
        // Clean display name
        const displayName = cleanFeatureName(c.feature);
        
        // Normalize width (max width should represent 40% of parent container, since 50% is half width)
        const pctWidth = Math.min((Math.abs(val) / maxVal) * 45, 45).toFixed(1);
        
        const row = document.createElement('div');
        row.className = 'shap-row';
        
        // Define direction class and value display
        let dirClass = "";
        let valString = "";
        let barStyle = "";
        
        if (val > 0) {
            dirClass = "pos";
            valString = `+${val.toFixed(3)}`;
            barStyle = `width: ${pctWidth}%; left: 50%;`;
        } else {
            dirClass = "neg";
            valString = `${val.toFixed(3)}`;
            barStyle = `width: ${pctWidth}%; right: 50%;`;
        }
        
        row.innerHTML = `
            <div>
                <span class="shap-feat-name" title="${displayName}">${displayName}</span>
                <span class="shap-feat-val">value: ${raw}</span>
            </div>
            <div class="shap-bar-container">
                <div class="shap-bar ${val > 0 ? 'positive' : 'negative'}" style="${barStyle}"></div>
            </div>
            <div class="shap-impact-val ${dirClass}">${valString}</div>
        `;
        
        listContainer.appendChild(row);
    });
}

// Business Simulator Calculations
const simBase = document.getElementById('sim-base');
const simChurn = document.getElementById('sim-churn');
const simArpu = document.getElementById('sim-arpu');
const simOffer = document.getElementById('sim-offer');
const simSuccess = document.getElementById('sim-success');

const valBase = document.getElementById('val-sim-base');
const valChurn = document.getElementById('val-sim-churn');
const valArpu = document.getElementById('val-sim-arpu');
const valOffer = document.getElementById('val-sim-offer');
const valSuccess = document.getElementById('val-sim-success');

function formatCurrency(num) {
    return '$' + Math.round(num).toLocaleString();
}

function updateSimulation() {
    const base = parseInt(simBase.value);
    const churn = parseInt(simChurn.value) / 100;
    const arpu = parseInt(simArpu.value);
    const offer = parseInt(simOffer.value);
    const success = parseInt(simSuccess.value) / 100;
    
    // Update labels
    valBase.textContent = base.toLocaleString();
    valChurn.textContent = simChurn.value + '%';
    valArpu.textContent = '$' + arpu.toLocaleString();
    valOffer.textContent = '$' + offer;
    valSuccess.textContent = simSuccess.value + '%';
    
    // Simulator Formulas (Focusing on a high-risk group targeted using ML model)
    // 1. Annual Churners without campaign
    const totalChurned = base * churn;
    const revAtRisk = totalChurned * arpu;
    
    // 2. Target Campaign size (We run predictions, and only target the high-risk cohort:
    // Let's target the highest risk cohort equal to 1.5x the expected churn rate to capture key churners)
    const targetedUsers = Math.min(totalChurned * 1.5, base);
    const campaignCost = targetedUsers * offer;
    
    // 3. Out of targeted users, suppose our model captured 80% of all potential churners in this cohort.
    // Churners targeted = 80% of totalChurned
    const churnersTargeted = totalChurned * 0.8;
    const customersSaved = churnersTargeted * success;
    
    // 4. Savings
    const revSaved = customersSaved * arpu;
    const netSavings = revSaved - campaignCost;
    
    // 5. ROI
    let roi = 0;
    if (campaignCost > 0) {
        roi = (netSavings / campaignCost) * 100;
    }
    
    // Update UI elements
    document.getElementById('outcome-risk-rev').textContent = formatCurrency(revAtRisk);
    document.getElementById('outcome-saved-customers').textContent = Math.round(customersSaved).toLocaleString();
    document.getElementById('outcome-cost').textContent = formatCurrency(campaignCost);
    
    const roiEl = document.getElementById('outcome-roi');
    roiEl.textContent = roi.toFixed(1) + '%';
    roiEl.style.color = roi >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    
    const savingsEl = document.getElementById('outcome-savings');
    savingsEl.textContent = formatCurrency(netSavings);
    if (netSavings >= 0) {
        savingsEl.style.color = 'var(--color-success)';
        savingsEl.style.textShadow = '0 0 20px var(--color-success-glow)';
    } else {
        savingsEl.style.color = 'var(--color-danger)';
        savingsEl.style.textShadow = '0 0 20px var(--color-danger-glow)';
    }
}

// Listen to Simulator Slider inputs
[simBase, simChurn, simArpu, simOffer, simSuccess].forEach(slider => {
    slider.addEventListener('input', updateSimulation);
});

// Run simulator initially
updateSimulation();
