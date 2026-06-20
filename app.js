/**
 * Payroll Calculator
 * Calculates monthly take-home pay with overtime and Cambodia progressive income tax.
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const WORKING_DAYS_PER_MONTH = 22;
  const HOURS_PER_DAY = 8;
  const OT_MULTIPLIER = 2; // 200%
  const PENSION_FUND = 6;

  /** Progressive tax brackets: [width in USD, rate as decimal] */
  const TAX_BRACKETS = [
    { width: 375, rate: 0 },
    { width: 125, rate: 0.05 },
    { width: 1625, rate: 0.1 },
    { width: 1000, rate: 0.15 },
  ];
  const TOP_TAX_RATE = 0.2;

  // ---------------------------------------------------------------------------
  // DOM References
  // ---------------------------------------------------------------------------

  const baseSalaryInput = document.getElementById("base-salary");
  const otHoursInput = document.getElementById("ot-hours");
  const baseSalaryError = document.getElementById("base-salary-error");
  const otHoursError = document.getElementById("ot-hours-error");

  /** Track whether the user has interacted with each field */
  const touched = {
    baseSalary: false,
    otHours: false,
  };

  const resultElements = {
    baseSalary: document.getElementById("result-base-salary"),
    dailyRate: document.getElementById("result-daily-rate"),
    hourlyRate: document.getElementById("result-hourly-rate"),
    otPay: document.getElementById("result-ot-pay"),
    earningsBeforeTax: document.getElementById("result-earnings-before-tax"),
    pension: document.getElementById("result-pension"),
    incomeTax: document.getElementById("result-income-tax"),
    takeHome: document.getElementById("result-take-home"),
  };

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /**
   * Format a number as USD currency with 2 decimal places.
   * @param {number} value
   * @returns {string}
   */
  function formatUSD(value) {
    return (
      "$" +
      value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  /**
   * Format OT hours for display (show decimals only when needed).
   * @param {number} hours
   * @returns {string}
   */
  function formatHours(hours) {
    return hours % 1 === 0 ? String(hours) : hours.toFixed(2);
  }

  // ---------------------------------------------------------------------------
  // Tax Calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate progressive income tax on monthly taxable salary.
   * @param {number} taxableAmount - Net earning before tax
   * @returns {number}
   */
  function calculateProgressiveTax(taxableAmount) {
    if (taxableAmount <= 0) return 0;

    let remaining = taxableAmount;
    let totalTax = 0;

    for (const bracket of TAX_BRACKETS) {
      if (remaining <= 0) break;

      const taxableInBracket = Math.min(remaining, bracket.width);
      totalTax += taxableInBracket * bracket.rate;
      remaining -= taxableInBracket;
    }

    if (remaining > 0) {
      totalTax += remaining * TOP_TAX_RATE;
    }

    return totalTax;
  }

  // ---------------------------------------------------------------------------
  // Payroll Calculation
  // ---------------------------------------------------------------------------

  /**
   * Run the full payroll calculation pipeline.
   * @param {number} baseSalary
   * @param {number} otHours
   * @returns {object}
   */
  function calculatePayroll(baseSalary, otHours) {
    const dailyRate = baseSalary / WORKING_DAYS_PER_MONTH;
    const hourlyRate = dailyRate / HOURS_PER_DAY;
    const otPay = hourlyRate * otHours * OT_MULTIPLIER;
    const earningsBeforeTax = baseSalary + otPay;
    const incomeTax = calculateProgressiveTax(earningsBeforeTax);
    const takeHomePay = earningsBeforeTax - incomeTax - PENSION_FUND;

    return {
      baseSalary,
      otHours,
      dailyRate,
      hourlyRate,
      otPay,
      earningsBeforeTax,
      pension: PENSION_FUND,
      incomeTax,
      takeHomePay,
    };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate a numeric input field.
   * @param {HTMLInputElement} input
   * @param {HTMLElement} errorEl
   * @param {object} options
   * @returns {{ valid: boolean, value: number | null }}
   */
  function validateInput(input, errorEl, options) {
    const { label, required, showRequiredError } = options;
    const raw = input.value.trim();

    input.classList.remove("input--error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    if (raw === "") {
      if (required && showRequiredError) {
        showError(input, errorEl, `${label} is required.`);
        return { valid: false, value: null };
      }
      return { valid: false, value: null };
    }

    const value = parseFloat(raw);

    if (Number.isNaN(value)) {
      showError(input, errorEl, `${label} must be a valid number.`);
      return { valid: false, value: null };
    }

    if (value < 0) {
      showError(input, errorEl, `${label} cannot be negative.`);
      return { valid: false, value: null };
    }

    return { valid: true, value };
  }

  /**
   * Display a validation error on an input.
   * @param {HTMLInputElement} input
   * @param {HTMLElement} errorEl
   * @param {string} message
   */
  function showError(input, errorEl, message) {
    input.classList.add("input--error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }

  // ---------------------------------------------------------------------------
  // UI Updates
  // ---------------------------------------------------------------------------

  /**
   * Reset all result fields to placeholder state.
   */
  function clearResults() {
    resultElements.baseSalary.textContent = "—";
    resultElements.dailyRate.textContent = "—";
    resultElements.hourlyRate.textContent = "—";
    resultElements.otPay.textContent = "—";
    resultElements.earningsBeforeTax.textContent = "—";
    resultElements.pension.textContent = "—";
    resultElements.incomeTax.textContent = "—";
    resultElements.takeHome.textContent = "—";
  }

  /**
   * Render calculated payroll results to the DOM.
   * @param {object} results
   */
  function displayResults(results) {
    resultElements.baseSalary.textContent = formatUSD(results.baseSalary);
    resultElements.dailyRate.textContent = formatUSD(results.dailyRate);
    resultElements.hourlyRate.textContent = formatUSD(results.hourlyRate);
    resultElements.otPay.textContent = formatUSD(results.otPay);
    resultElements.earningsBeforeTax.textContent = formatUSD(
      results.earningsBeforeTax
    );
    resultElements.pension.textContent = "-" + formatUSD(results.pension);
    resultElements.incomeTax.textContent = "-" + formatUSD(results.incomeTax);
    resultElements.takeHome.textContent = formatUSD(results.takeHomePay);
  }

  /**
   * Validate inputs and recalculate payroll on every change.
   */
  function handleInputChange() {
    const salaryResult = validateInput(baseSalaryInput, baseSalaryError, {
      label: "Base salary",
      required: true,
      showRequiredError: touched.baseSalary,
    });

    const otResult = validateInput(otHoursInput, otHoursError, {
      label: "OT hours",
      required: true,
      showRequiredError: touched.otHours,
    });

    if (!salaryResult.valid || !otResult.valid) {
      clearResults();
      return;
    }

    const payroll = calculatePayroll(salaryResult.value, otResult.value);
    displayResults(payroll);
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function markTouched(field) {
    return function () {
      touched[field] = true;
      handleInputChange();
    };
  }

  baseSalaryInput.addEventListener("input", markTouched("baseSalary"));
  otHoursInput.addEventListener("input", markTouched("otHours"));
  baseSalaryInput.addEventListener("blur", markTouched("baseSalary"));
  otHoursInput.addEventListener("blur", markTouched("otHours"));

  // Prevent form submission (calculations are automatic)
  document.getElementById("payroll-form").addEventListener("submit", function (e) {
    e.preventDefault();
  });
})();
