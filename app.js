/**
 * Calculators — payroll take-home, loan amortization, and DSCR coverage.
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

  const MODES = {
    payroll: { title: "Payroll" },
    loan: { title: "Loan" },
    dscr: { title: "DSCR" },
  };

  // ---------------------------------------------------------------------------
  // DOM References
  // ---------------------------------------------------------------------------

  const modeSwitcher = document.getElementById("mode-switcher");
  const modeTrigger = document.getElementById("mode-trigger");
  const modeMenu = document.getElementById("mode-menu");
  const modeTitle = document.getElementById("mode-title");
  const modeOptions = modeMenu.querySelectorAll("[data-mode]");
  const modePanels = document.querySelectorAll("[data-mode-panel]");

  const baseSalaryInput = document.getElementById("base-salary");
  const otHoursInput = document.getElementById("ot-hours");
  const baseSalaryError = document.getElementById("base-salary-error");
  const otHoursError = document.getElementById("ot-hours-error");

  const loanAmountInput = document.getElementById("loan-amount");
  const loanTenureInput = document.getElementById("loan-tenure");
  const loanInterestInput = document.getElementById("loan-interest");
  const loanAmountError = document.getElementById("loan-amount-error");
  const loanTenureError = document.getElementById("loan-tenure-error");
  const loanInterestError = document.getElementById("loan-interest-error");

  const dscrIncomeInput = document.getElementById("dscr-income");
  const dscrExpenseInput = document.getElementById("dscr-expense");
  const dscrLoanPaymentInput = document.getElementById("dscr-loan-payment");
  const dscrDebtInput = document.getElementById("dscr-debt");
  const dscrIncomeError = document.getElementById("dscr-income-error");
  const dscrExpenseError = document.getElementById("dscr-expense-error");
  const dscrLoanPaymentError = document.getElementById("dscr-loan-payment-error");
  const dscrDebtError = document.getElementById("dscr-debt-error");

  /** Track whether the user has interacted with each field */
  const touched = {
    baseSalary: false,
    otHours: false,
    loanAmount: false,
    loanTenure: false,
    loanInterest: false,
    dscrIncome: false,
    dscrExpense: false,
    dscrLoanPayment: false,
    dscrDebt: false,
  };

  const payrollSummary = document.querySelector('[data-mode-panel="payroll"] .summary');
  const loanSummary = document.querySelector('[data-mode-panel="loan"] .summary');
  const dscrSummary = document.querySelector('[data-mode-panel="dscr"] .summary');

  const payrollResults = {
    baseSalary: document.getElementById("result-base-salary"),
    dailyRate: document.getElementById("result-daily-rate"),
    hourlyRate: document.getElementById("result-hourly-rate"),
    otPay: document.getElementById("result-ot-pay"),
    earningsBeforeTax: document.getElementById("result-earnings-before-tax"),
    pension: document.getElementById("result-pension"),
    incomeTax: document.getElementById("result-income-tax"),
    takeHome: document.getElementById("result-take-home"),
  };

  const loanResults = {
    amount: document.getElementById("result-loan-amount"),
    tenure: document.getElementById("result-loan-tenure"),
    interest: document.getElementById("result-loan-interest"),
    total: document.getElementById("result-loan-total"),
    interestPaid: document.getElementById("result-loan-interest-paid"),
    payment: document.getElementById("result-loan-payment"),
  };

  const dscrResults = {
    netIncome: document.getElementById("result-dscr-net-income"),
    debtService: document.getElementById("result-dscr-debt-service"),
    value: document.getElementById("result-dscr-value"),
  };

  let currentMode = "payroll";

  const MODE_STORAGE_KEY = "payroll-calculator:mode";
  const INPUTS_STORAGE_KEY = "payroll-calculator:inputs";

  const persistableInputs = {
    baseSalary: baseSalaryInput,
    otHours: otHoursInput,
    loanAmount: loanAmountInput,
    loanTenure: loanTenureInput,
    loanInterest: loanInterestInput,
    dscrIncome: dscrIncomeInput,
    dscrExpense: dscrExpenseInput,
    dscrLoanPayment: dscrLoanPaymentInput,
    dscrDebt: dscrDebtInput,
  };

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * @param {string} mode
   */
  function saveMode(mode) {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch (err) {
      /* storage may be unavailable */
    }
  }

  /**
   * @returns {string | null}
   */
  function readSavedMode() {
    try {
      const mode = localStorage.getItem(MODE_STORAGE_KEY);
      return mode && MODES[mode] ? mode : null;
    } catch (err) {
      return null;
    }
  }

  function saveInputs() {
    try {
      const data = {};
      Object.keys(persistableInputs).forEach(function (key) {
        data[key] = persistableInputs[key].value;
      });
      sessionStorage.setItem(INPUTS_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      /* storage may be unavailable */
    }
  }

  function restoreInputs() {
    try {
      const raw = sessionStorage.getItem(INPUTS_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.keys(persistableInputs).forEach(function (key) {
        if (typeof data[key] !== "string") return;
        persistableInputs[key].value = data[key];
        if (data[key].trim() !== "") {
          touched[key] = true;
        }
      });
    } catch (err) {
      /* ignore malformed session data */
    }
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /**
   * Format a number as USD currency with 2 decimal places.
   * Negative values render as -$1.00.
   * @param {number} value
   * @returns {string}
   */
  function formatUSD(value) {
    const formatted =
      "$" +
      Math.abs(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    return value < 0 ? "-" + formatted : formatted;
  }

  /**
   * Set an element's text and mark it red when the amount is negative.
   * @param {HTMLElement} el
   * @param {string} text
   * @param {boolean} [negative]
   */
  function setText(el, text, negative) {
    el.textContent = text;
    el.classList.toggle("is-negative", Boolean(negative));
  }

  /**
   * @param {HTMLElement} el
   * @param {number} value
   */
  function setUSD(el, value) {
    setText(el, formatUSD(value), value < 0);
  }

  /**
   * @param {HTMLElement} el
   */
  function clearText(el) {
    setText(el, "—", false);
  }

  /**
   * Format a percentage, showing decimals only when needed.
   * @param {number} value
   * @returns {string}
   */
  function formatPercent(value) {
    const formatted = value % 1 === 0 ? String(value) : value.toFixed(2);
    return formatted + "%";
  }

  /**
   * Format tenure in months for display.
   * @param {number} months
   * @returns {string}
   */
  function formatTenure(months) {
    const formatted = months % 1 === 0 ? String(months) : months.toFixed(2);
    return formatted + (months === 1 ? " month" : " months");
  }

  /**
   * Format a DSCR ratio for display.
   * @param {number} value
   * @returns {string}
   */
  function formatDscr(value) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * @param {HTMLElement} el
   * @param {number} dscr
   */
  function setDscrValue(el, dscr) {
    el.textContent = formatDscr(dscr);
    el.classList.remove("is-negative", "is-success", "is-warning", "is-error");

    if (dscr > 2) {
      el.classList.add("is-success");
    } else if (dscr >= 1.5) {
      el.classList.add("is-warning");
    } else {
      el.classList.add("is-error");
    }
  }

  /**
   * @param {HTMLElement} el
   */
  function clearDscrValue(el) {
    el.textContent = "—";
    el.classList.remove("is-negative", "is-success", "is-warning", "is-error");
  }

  function setSummaryReady(summaryEl, ready) {
    if (!summaryEl) return;
    summaryEl.classList.toggle("is-ready", ready);
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
  // Loan Calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate a standard amortizing loan payment.
   * @param {number} principal
   * @param {number} tenureMonths
   * @param {number} annualRatePercent
   * @returns {object}
   */
  function calculateLoan(principal, tenureMonths, annualRatePercent) {
    const monthlyRate = annualRatePercent / 100 / 12;

    let monthlyPayment;
    if (monthlyRate === 0) {
      monthlyPayment = principal / tenureMonths;
    } else {
      const factor = Math.pow(1 + monthlyRate, tenureMonths);
      monthlyPayment = (principal * (monthlyRate * factor)) / (factor - 1);
    }

    const totalPayable = monthlyPayment * tenureMonths;
    const totalInterest = totalPayable - principal;

    return {
      principal,
      tenureMonths,
      annualRatePercent,
      monthlyPayment,
      totalPayable,
      totalInterest,
    };
  }

  // ---------------------------------------------------------------------------
  // DSCR Calculation
  // ---------------------------------------------------------------------------

  /**
   * DSCR = (Monthly Income - Monthly Expense) / (Monthly Loan Repayment + Debt)
   * @param {number} monthlyIncome
   * @param {number} monthlyExpense
   * @param {number} monthlyLoanPayment
   * @param {number} debt
   * @returns {object}
   */
  function calculateDscr(monthlyIncome, monthlyExpense, monthlyLoanPayment, debt) {
    const netIncome = monthlyIncome - monthlyExpense;
    const totalDebtService = monthlyLoanPayment + debt;
    const dscr = totalDebtService > 0 ? netIncome / totalDebtService : null;

    return {
      netIncome,
      totalDebtService,
      dscr,
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
    const {
      label,
      required,
      showRequiredError,
      emptyAsDefault,
      defaultValue,
      minExclusive,
    } = options;
    const raw = input.value.trim();

    input.classList.remove("input--error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    if (raw === "") {
      if (emptyAsDefault) {
        return { valid: true, value: defaultValue ?? 0 };
      }
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

    if (minExclusive != null && value <= minExclusive) {
      showError(input, errorEl, `${label} must be greater than ${minExclusive}.`);
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
  // Payroll UI
  // ---------------------------------------------------------------------------

  function clearPayrollResults() {
    clearText(payrollResults.baseSalary);
    clearText(payrollResults.dailyRate);
    clearText(payrollResults.hourlyRate);
    clearText(payrollResults.otPay);
    clearText(payrollResults.earningsBeforeTax);
    clearText(payrollResults.pension);
    clearText(payrollResults.incomeTax);
    clearText(payrollResults.takeHome);
    setSummaryReady(payrollSummary, false);
  }

  /**
   * @param {object} results
   */
  function displayPayrollResults(results) {
    setUSD(payrollResults.baseSalary, results.baseSalary);
    setUSD(payrollResults.dailyRate, results.dailyRate);
    setUSD(payrollResults.hourlyRate, results.hourlyRate);
    setUSD(payrollResults.otPay, results.otPay);
    setUSD(payrollResults.earningsBeforeTax, results.earningsBeforeTax);
    setUSD(payrollResults.pension, -results.pension);
    setUSD(payrollResults.incomeTax, -results.incomeTax);
    setUSD(payrollResults.takeHome, results.takeHomePay);
    setSummaryReady(payrollSummary, true);
  }

  function handlePayrollChange() {
    const salaryResult = validateInput(baseSalaryInput, baseSalaryError, {
      label: "Base salary",
      required: true,
      showRequiredError: touched.baseSalary,
    });

    const otResult = validateInput(otHoursInput, otHoursError, {
      label: "OT hours",
      required: false,
      showRequiredError: false,
      emptyAsDefault: true,
      defaultValue: 0,
    });

    if (!salaryResult.valid || !otResult.valid) {
      clearPayrollResults();
      return;
    }

    displayPayrollResults(calculatePayroll(salaryResult.value, otResult.value));
  }

  // ---------------------------------------------------------------------------
  // Loan UI
  // ---------------------------------------------------------------------------

  function clearLoanResults() {
    clearText(loanResults.amount);
    clearText(loanResults.tenure);
    clearText(loanResults.interest);
    clearText(loanResults.total);
    clearText(loanResults.interestPaid);
    clearText(loanResults.payment);
    setSummaryReady(loanSummary, false);
  }

  /**
   * @param {object} results
   */
  function displayLoanResults(results) {
    setUSD(loanResults.amount, results.principal);
    setText(loanResults.tenure, formatTenure(results.tenureMonths));
    setText(loanResults.interest, formatPercent(results.annualRatePercent));
    setUSD(loanResults.total, results.totalPayable);
    setUSD(loanResults.interestPaid, results.totalInterest);
    setUSD(loanResults.payment, results.monthlyPayment);
    setSummaryReady(loanSummary, true);
  }

  function handleLoanChange() {
    const amountResult = validateInput(loanAmountInput, loanAmountError, {
      label: "Loan amount",
      required: true,
      showRequiredError: touched.loanAmount,
    });

    const tenureResult = validateInput(loanTenureInput, loanTenureError, {
      label: "Tenure",
      required: true,
      showRequiredError: touched.loanTenure,
      minExclusive: 0,
    });

    const interestResult = validateInput(loanInterestInput, loanInterestError, {
      label: "Interest",
      required: true,
      showRequiredError: touched.loanInterest,
    });

    if (!amountResult.valid || !tenureResult.valid || !interestResult.valid) {
      clearLoanResults();
      return;
    }

    displayLoanResults(
      calculateLoan(amountResult.value, tenureResult.value, interestResult.value)
    );
  }

  // ---------------------------------------------------------------------------
  // DSCR UI
  // ---------------------------------------------------------------------------

  function clearDscrResults() {
    clearText(dscrResults.netIncome);
    clearText(dscrResults.debtService);
    clearDscrValue(dscrResults.value);
    setSummaryReady(dscrSummary, false);
  }

  /**
   * @param {object} results
   */
  function displayDscrResults(results) {
    setUSD(dscrResults.netIncome, results.netIncome);
    setUSD(dscrResults.debtService, results.totalDebtService);
    setDscrValue(dscrResults.value, results.dscr);
    setSummaryReady(dscrSummary, true);
  }

  function handleDscrChange() {
    const incomeResult = validateInput(dscrIncomeInput, dscrIncomeError, {
      label: "Monthly Income",
      required: true,
      showRequiredError: touched.dscrIncome,
    });

    const expenseResult = validateInput(dscrExpenseInput, dscrExpenseError, {
      label: "Monthly Expense",
      required: false,
      showRequiredError: false,
      emptyAsDefault: true,
      defaultValue: 0,
    });

    const paymentResult = validateInput(
      dscrLoanPaymentInput,
      dscrLoanPaymentError,
      {
        label: "Monthly Loan Repayment",
        required: true,
        showRequiredError: touched.dscrLoanPayment,
      }
    );

    const debtResult = validateInput(dscrDebtInput, dscrDebtError, {
      label: "Debt",
      required: false,
      showRequiredError: false,
      emptyAsDefault: true,
      defaultValue: 0,
    });

    if (
      !incomeResult.valid ||
      !expenseResult.valid ||
      !paymentResult.valid ||
      !debtResult.valid
    ) {
      clearDscrResults();
      return;
    }

    const results = calculateDscr(
      incomeResult.value,
      expenseResult.value,
      paymentResult.value,
      debtResult.value
    );

    if (results.dscr == null) {
      showError(
        dscrLoanPaymentInput,
        dscrLoanPaymentError,
        "Monthly Loan Repayment plus Debt must be greater than 0."
      );
      clearDscrResults();
      return;
    }

    displayDscrResults(results);
  }

  // ---------------------------------------------------------------------------
  // Mode Switcher
  // ---------------------------------------------------------------------------

  function isMenuOpen() {
    return !modeMenu.hidden;
  }

  function openMenu() {
    modeMenu.hidden = false;
    modeSwitcher.classList.add("is-open");
    modeTrigger.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    modeMenu.hidden = true;
    modeSwitcher.classList.remove("is-open");
    modeTrigger.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  /**
   * @param {string} mode
   * @param {{ persist?: boolean }} [options]
   */
  function setMode(mode, options) {
    if (!MODES[mode] || mode === currentMode) {
      closeMenu();
      return;
    }

    currentMode = mode;
    const config = MODES[mode];

    modeTitle.textContent = config.title;
    document.title = config.title;

    modeOptions.forEach(function (option) {
      if (option.getAttribute("data-mode") === mode) {
        option.setAttribute("aria-current", "true");
      } else {
        option.removeAttribute("aria-current");
      }
    });

    modePanels.forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-mode-panel") !== mode;
    });

    if (!options || options.persist !== false) {
      saveMode(mode);
    }

    closeMenu();
  }

  modeTrigger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  modeOptions.forEach(function (option) {
    option.addEventListener("click", function (e) {
      e.stopPropagation();
      setMode(option.getAttribute("data-mode"));
    });
  });

  document.addEventListener("click", function (e) {
    if (!isMenuOpen()) return;
    if (!modeSwitcher.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isMenuOpen()) {
      closeMenu();
      modeTrigger.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function markTouched(field, handler) {
    return function () {
      touched[field] = true;
      handler();
      saveInputs();
    };
  }

  baseSalaryInput.addEventListener("input", markTouched("baseSalary", handlePayrollChange));
  otHoursInput.addEventListener("input", markTouched("otHours", handlePayrollChange));
  baseSalaryInput.addEventListener("blur", markTouched("baseSalary", handlePayrollChange));
  otHoursInput.addEventListener("blur", markTouched("otHours", handlePayrollChange));

  loanAmountInput.addEventListener("input", markTouched("loanAmount", handleLoanChange));
  loanTenureInput.addEventListener("input", markTouched("loanTenure", handleLoanChange));
  loanInterestInput.addEventListener("input", markTouched("loanInterest", handleLoanChange));
  loanAmountInput.addEventListener("blur", markTouched("loanAmount", handleLoanChange));
  loanTenureInput.addEventListener("blur", markTouched("loanTenure", handleLoanChange));
  loanInterestInput.addEventListener("blur", markTouched("loanInterest", handleLoanChange));

  dscrIncomeInput.addEventListener("input", markTouched("dscrIncome", handleDscrChange));
  dscrExpenseInput.addEventListener("input", markTouched("dscrExpense", handleDscrChange));
  dscrLoanPaymentInput.addEventListener(
    "input",
    markTouched("dscrLoanPayment", handleDscrChange)
  );
  dscrDebtInput.addEventListener("input", markTouched("dscrDebt", handleDscrChange));
  dscrIncomeInput.addEventListener("blur", markTouched("dscrIncome", handleDscrChange));
  dscrExpenseInput.addEventListener("blur", markTouched("dscrExpense", handleDscrChange));
  dscrLoanPaymentInput.addEventListener(
    "blur",
    markTouched("dscrLoanPayment", handleDscrChange)
  );
  dscrDebtInput.addEventListener("blur", markTouched("dscrDebt", handleDscrChange));

  let deferredInstallPrompt = null;
  const installButton = document.getElementById("install-app");
  if (installButton) {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
    });

    installButton.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });
  }

  document.getElementById("payroll-form").addEventListener("submit", function (e) {
    e.preventDefault();
  });
  document.getElementById("loan-form").addEventListener("submit", function (e) {
    e.preventDefault();
  });
  document.getElementById("dscr-form").addEventListener("submit", function (e) {
    e.preventDefault();
  });

  restoreInputs();
  const savedMode = readSavedMode();
  if (savedMode) {
    setMode(savedMode, { persist: false });
  }
  handlePayrollChange();
  handleLoanChange();
  handleDscrChange();
})();
