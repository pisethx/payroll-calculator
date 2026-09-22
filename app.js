/**
 * Calculators — payroll take-home, loan amortization, DSCR coverage, and term deposits.
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

  /**
   * Term deposit interest rates (% p.a.). Update this table to change rates.
   * null = N/A for that credit type / currency.
   */
  const TERM_DEPOSIT_RATES = [
    { months: 1, usdMaturity: 2.0, khrMaturity: 2.0, usdMonthly: null, khrMonthly: null },
    { months: 3, usdMaturity: 2.5, khrMaturity: 2.5, usdMonthly: 2.25, khrMonthly: 2.25 },
    { months: 6, usdMaturity: 3.5, khrMaturity: 3.5, usdMonthly: 3.25, khrMonthly: 3.25 },
    { months: 12, usdMaturity: 4.5, khrMaturity: 4.5, usdMonthly: 4.0, khrMonthly: 4.0 },
    { months: 18, usdMaturity: 4.5, khrMaturity: 4.5, usdMonthly: 4.0, khrMonthly: 4.0 },
    { months: 24, usdMaturity: 4.5, khrMaturity: 4.5, usdMonthly: 4.0, khrMonthly: 4.0 },
    { months: 36, usdMaturity: 5.5, khrMaturity: 5.5, usdMonthly: 4.0, khrMonthly: 4.0 },
    { months: 48, usdMaturity: 5.5, khrMaturity: 5.5, usdMonthly: 4.0, khrMonthly: 4.0 },
    { months: 60, usdMaturity: 5.5, khrMaturity: 5.5, usdMonthly: 4.0, khrMonthly: null },
  ];

  const MODES = {
    payroll: { title: "Payroll" },
    loan: { title: "Loan" },
    dscr: { title: "DSCR" },
    "term-deposit": { title: "Term Deposit" },
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
  const dscrIncomeError = document.getElementById("dscr-income-error");
  const dscrExpenseError = document.getElementById("dscr-expense-error");
  const dscrLoanPaymentError = document.getElementById("dscr-loan-payment-error");

  const tdAmountInput = document.getElementById("td-amount");
  const tdAmountPrefix = document.getElementById("td-amount-prefix");
  const tdAmountError = document.getElementById("td-amount-error");
  const tdTermSelect = document.getElementById("td-term");
  const tdTermError = document.getElementById("td-term-error");
  const tdCurrencyButtons = document.querySelectorAll("[data-td-currency]");
  const tdCreditButtons = document.querySelectorAll("[data-td-credit]");
  const tdMonthlyRow = document.getElementById("result-td-monthly-row");

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
    tdAmount: false,
    tdTerm: false,
  };

  const payrollSummary = document.querySelector('[data-mode-panel="payroll"] .summary');
  const loanSummary = document.querySelector('[data-mode-panel="loan"] .summary');
  const dscrSummary = document.querySelector('[data-mode-panel="dscr"] .summary');
  const tdSummary = document.querySelector('[data-mode-panel="term-deposit"] .summary');

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
    loanPayment: document.getElementById("result-dscr-loan-payment"),
    value: document.getElementById("result-dscr-value"),
  };

  const tdResults = {
    interest: document.getElementById("result-td-interest"),
    amount: document.getElementById("result-td-amount"),
    term: document.getElementById("result-td-term"),
    rate: document.getElementById("result-td-rate"),
    monthly: document.getElementById("result-td-monthly"),
    maturity: document.getElementById("result-td-maturity"),
  };

  let currentMode = "payroll";
  let tdCurrency = "usd";
  let tdCreditType = "maturity";

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
    tdAmount: tdAmountInput,
    tdTerm: tdTermSelect,
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
      data.tdCurrency = tdCurrency;
      data.tdCreditType = tdCreditType;
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
      if (data.tdCurrency === "usd" || data.tdCurrency === "khr") {
        tdCurrency = data.tdCurrency;
      }
      if (data.tdCreditType === "maturity" || data.tdCreditType === "monthly") {
        tdCreditType = data.tdCreditType;
      }
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
   * Format a number as KHR with no decimals.
   * @param {number} value
   * @returns {string}
   */
  function formatKHR(value) {
    const formatted =
      "៛" +
      Math.abs(Math.round(value)).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      });
    return value < 0 ? "-" + formatted : formatted;
  }

  /**
   * @param {number} value
   * @param {"usd" | "khr"} currency
   * @returns {string}
   */
  function formatMoney(value, currency) {
    return currency === "khr" ? formatKHR(value) : formatUSD(value);
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
   * @param {number} value
   * @param {"usd" | "khr"} currency
   */
  function setMoney(el, value, currency) {
    setText(el, formatMoney(value, currency), value < 0);
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
   * DSCR = (Monthly Income - Monthly Expense) / Monthly Loan Repayment
   * @param {number} monthlyIncome
   * @param {number} monthlyExpense
   * @param {number} monthlyLoanPayment
   * @returns {object}
   */
  function calculateDscr(monthlyIncome, monthlyExpense, monthlyLoanPayment) {
    const netIncome = monthlyIncome - monthlyExpense;
    const dscr = monthlyLoanPayment > 0 ? netIncome / monthlyLoanPayment : null;

    return {
      netIncome,
      monthlyLoanPayment,
      dscr,
    };
  }

  // ---------------------------------------------------------------------------
  // Term Deposit Calculation
  // ---------------------------------------------------------------------------

  /**
   * @param {number} months
   * @returns {object | null}
   */
  function findTermDepositRateRow(months) {
    for (let i = 0; i < TERM_DEPOSIT_RATES.length; i++) {
      if (TERM_DEPOSIT_RATES[i].months === months) {
        return TERM_DEPOSIT_RATES[i];
      }
    }
    return null;
  }

  /**
   * Look up the annual rate for a term / currency / credit type.
   * @param {number} months
   * @param {"usd" | "khr"} currency
   * @param {"maturity" | "monthly"} creditType
   * @returns {number | null}
   */
  function lookupTermDepositRate(months, currency, creditType) {
    const row = findTermDepositRateRow(months);
    if (!row) return null;

    if (creditType === "monthly") {
      return currency === "khr" ? row.khrMonthly : row.usdMonthly;
    }
    return currency === "khr" ? row.khrMaturity : row.usdMaturity;
  }

  /**
   * Whether monthly credit is available for a term / currency.
   * @param {number} months
   * @param {"usd" | "khr"} currency
   * @returns {boolean}
   */
  function isMonthlyCreditAvailable(months, currency) {
    const rate = lookupTermDepositRate(months, currency, "monthly");
    return rate != null;
  }

  /**
   * Simple-interest term deposit calculation.
   * @param {number} amount
   * @param {number} months
   * @param {number} ratePercent
   * @param {"maturity" | "monthly"} creditType
   * @param {"usd" | "khr"} currency
   * @returns {object}
   */
  function calculateTermDeposit(amount, months, ratePercent, creditType, currency) {
    const years = months / 12;
    const totalInterest = amount * (ratePercent / 100) * years;
    const monthlyInterest = creditType === "monthly" ? totalInterest / months : null;
    const maturityValue = amount + totalInterest;

    return {
      amount,
      months,
      ratePercent,
      creditType,
      currency,
      totalInterest,
      monthlyInterest,
      maturityValue,
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
    clearText(dscrResults.loanPayment);
    clearDscrValue(dscrResults.value);
    setSummaryReady(dscrSummary, false);
  }

  /**
   * @param {object} results
   */
  function displayDscrResults(results) {
    setUSD(dscrResults.netIncome, results.netIncome);
    setUSD(dscrResults.loanPayment, results.monthlyLoanPayment);
    setDscrValue(dscrResults.value, results.dscr);
    setSummaryReady(dscrSummary, true);
  }

  /**
   * Read a required DSCR amount once both required fields may be filled.
   * @param {HTMLInputElement} input
   * @param {HTMLElement} errorEl
   * @param {string} label
   * @param {boolean} showRequiredError
   * @returns {number | null}
   */
  function readRequiredDscrAmount(input, errorEl, label, showRequiredError) {
    const raw = input.value.trim();

    input.classList.remove("input--error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    if (raw === "") {
      if (showRequiredError) {
        showError(input, errorEl, `${label} is required.`);
      }
      return null;
    }

    const result = validateInput(input, errorEl, {
      label,
      required: false,
      showRequiredError: false,
    });

    return result.valid ? result.value : null;
  }

  function handleDscrChange() {
    const expenseResult = validateInput(dscrExpenseInput, dscrExpenseError, {
      label: "Monthly Expense",
      required: false,
      showRequiredError: false,
      emptyAsDefault: true,
      defaultValue: 0,
    });

    if (!expenseResult.valid) {
      clearDscrResults();
      return;
    }

    const monthlyIncome = readRequiredDscrAmount(
      dscrIncomeInput,
      dscrIncomeError,
      "Monthly Income",
      touched.dscrIncome
    );
    const monthlyLoanPayment = readRequiredDscrAmount(
      dscrLoanPaymentInput,
      dscrLoanPaymentError,
      "Monthly Loan Repayment",
      touched.dscrLoanPayment
    );

    if (monthlyIncome == null || monthlyLoanPayment == null) {
      clearDscrResults();
      return;
    }

    const results = calculateDscr(
      monthlyIncome,
      expenseResult.value,
      monthlyLoanPayment
    );

    if (results.dscr == null) {
      showError(
        dscrLoanPaymentInput,
        dscrLoanPaymentError,
        "Monthly Loan Repayment must be greater than 0."
      );
      clearDscrResults();
      return;
    }

    displayDscrResults(results);
  }

  // ---------------------------------------------------------------------------
  // Term Deposit UI
  // ---------------------------------------------------------------------------

  function populateTermDepositTerms() {
    const previous = tdTermSelect.value;
    tdTermSelect.innerHTML = "";

    TERM_DEPOSIT_RATES.forEach(function (row) {
      const option = document.createElement("option");
      option.value = String(row.months);
      option.textContent =
        row.months === 1 ? "1 month" : row.months + " months";
      tdTermSelect.appendChild(option);
    });

    if (previous && findTermDepositRateRow(parseInt(previous, 10))) {
      tdTermSelect.value = previous;
    } else {
      tdTermSelect.value = String(TERM_DEPOSIT_RATES[0].months);
    }
  }

  function syncTermDepositCurrencyUI() {
    tdCurrencyButtons.forEach(function (button) {
      const selected = button.getAttribute("data-td-currency") === tdCurrency;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    if (tdCurrency === "khr") {
      tdAmountPrefix.textContent = "៛";
      tdAmountPrefix.classList.add("is-khr");
      tdAmountInput.step = "1";
      tdAmountInput.placeholder = "0";
    } else {
      tdAmountPrefix.textContent = "$";
      tdAmountPrefix.classList.remove("is-khr");
      tdAmountInput.step = "0.01";
      tdAmountInput.placeholder = "0.00";
    }
  }

  function syncTermDepositCreditUI() {
    const months = parseInt(tdTermSelect.value, 10);
    const monthlyAvailable = isMonthlyCreditAvailable(months, tdCurrency);
    const monthlyButton = document.querySelector('[data-td-credit="monthly"]');

    if (monthlyButton) {
      monthlyButton.disabled = !monthlyAvailable;
    }

    if (!monthlyAvailable && tdCreditType === "monthly") {
      tdCreditType = "maturity";
    }

    tdCreditButtons.forEach(function (button) {
      const selected = button.getAttribute("data-td-credit") === tdCreditType;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function clearTermDepositResults() {
    clearText(tdResults.interest);
    clearText(tdResults.amount);
    clearText(tdResults.term);
    clearText(tdResults.rate);
    clearText(tdResults.monthly);
    clearText(tdResults.maturity);
    tdMonthlyRow.hidden = true;
    setSummaryReady(tdSummary, false);
  }

  /**
   * @param {object} results
   */
  function displayTermDepositResults(results) {
    setMoney(tdResults.interest, results.totalInterest, results.currency);
    setMoney(tdResults.amount, results.amount, results.currency);
    setText(tdResults.term, formatTenure(results.months));
    setText(tdResults.rate, formatPercent(results.ratePercent));
    setMoney(tdResults.maturity, results.maturityValue, results.currency);

    if (results.creditType === "monthly" && results.monthlyInterest != null) {
      tdMonthlyRow.hidden = false;
      setMoney(tdResults.monthly, results.monthlyInterest, results.currency);
    } else {
      tdMonthlyRow.hidden = true;
      clearText(tdResults.monthly);
    }

    setSummaryReady(tdSummary, true);
  }

  function handleTermDepositChange() {
    syncTermDepositCreditUI();

    const amountResult = validateInput(tdAmountInput, tdAmountError, {
      label: "Amount",
      required: true,
      showRequiredError: touched.tdAmount,
    });

    const months = parseInt(tdTermSelect.value, 10);
    const ratePercent = lookupTermDepositRate(months, tdCurrency, tdCreditType);

    tdTermSelect.classList.remove("input--error");
    if (tdTermError) {
      tdTermError.hidden = true;
      tdTermError.textContent = "";
    }

    if (ratePercent == null) {
      if (touched.tdTerm || tdCreditType === "monthly") {
        showError(
          tdTermSelect,
          tdTermError,
          "Monthly credit interest is not available for this term."
        );
      }
      clearTermDepositResults();
      return;
    }

    if (!amountResult.valid) {
      clearTermDepositResults();
      return;
    }

    displayTermDepositResults(
      calculateTermDeposit(
        amountResult.value,
        months,
        ratePercent,
        tdCreditType,
        tdCurrency
      )
    );
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

    if (mode === "dscr") {
      handleDscrChange();
    } else if (mode === "term-deposit") {
      handleTermDepositChange();
    }
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

  function bindDscrField(field, input) {
    input.addEventListener("input", markTouched(field, handleDscrChange));
    input.addEventListener("change", markTouched(field, handleDscrChange));
    input.addEventListener("blur", markTouched(field, handleDscrChange));
  }

  bindDscrField("dscrIncome", dscrIncomeInput);
  bindDscrField("dscrExpense", dscrExpenseInput);
  bindDscrField("dscrLoanPayment", dscrLoanPaymentInput);

  tdAmountInput.addEventListener("input", markTouched("tdAmount", handleTermDepositChange));
  tdAmountInput.addEventListener("blur", markTouched("tdAmount", handleTermDepositChange));
  tdTermSelect.addEventListener("change", markTouched("tdTerm", handleTermDepositChange));

  tdCurrencyButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const next = button.getAttribute("data-td-currency");
      if (next !== "usd" && next !== "khr") return;
      tdCurrency = next;
      syncTermDepositCurrencyUI();
      handleTermDepositChange();
      saveInputs();
    });
  });

  tdCreditButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.disabled) return;
      const next = button.getAttribute("data-td-credit");
      if (next !== "maturity" && next !== "monthly") return;
      tdCreditType = next;
      handleTermDepositChange();
      saveInputs();
    });
  });

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
  document.getElementById("term-deposit-form").addEventListener("submit", function (e) {
    e.preventDefault();
  });

  populateTermDepositTerms();
  restoreInputs();
  syncTermDepositCurrencyUI();
  syncTermDepositCreditUI();
  const savedMode = readSavedMode();
  if (savedMode) {
    setMode(savedMode, { persist: false });
  }
  handlePayrollChange();
  handleLoanChange();
  handleDscrChange();
  handleTermDepositChange();
})();
