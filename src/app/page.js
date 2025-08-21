"use client";

import { useState, useEffect } from "react";

export default function FuneralCalculator() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [selectedItems, setSelectedItems] = useState({});
  const [funeralHomeName, setFuneralHomeName] = useState("");
  const [currentStep, setCurrentStep] = useState("input");
  const [groupedItems, setGroupedItems] = useState(null);

  // Gemini API configuration - UPDATED ENDPOINT
  const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const GEMINI_API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

  // Process items when results change
  useEffect(() => {
    if (results && currentStep === "calculator") {
      const processItems = async () => {
        const categorizedItems = await parseFormattedPrices(
          results.formatted_prices
        );
        setGroupedItems(categorizedItems);
      };
      processItems();
    }
  }, [results, currentStep]);

  const categorizeWithGemini = async (items) => {
    if (!items || items.length === 0) {
      throw new Error("No items to categorize");
    }

    const itemNames = items.map((item) => item.name).join("\n");

    try {
      console.log("Calling Gemini API for categorization...");

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a funeral industry expert. Categorize these funeral services and products into logical groups. Create 6-8 meaningful categories that make sense for funeral planning. 

Common categories include: 'Professional Services', 'Caskets & Containers', 'Cremation Services', 'Burial Services', 'Transportation', 'Facility Usage', 'Memorial Items', and 'Other Services'. 

Always put 'Other Services' last. Return ONLY a valid JSON object where keys are category names and values are arrays of item names that belong to that category.

Items to categorize:

${itemNames}

Return ONLY a JSON object with category names as keys and arrays of exact item names as values. Make sure 'Other Services' is the last category. Do not include any other text or explanation.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Gemini API error response:", errorData);

        // Handle specific error cases
        if (response.status === 400) {
          throw new Error(
            "Invalid API request. Please check your Gemini API key."
          );
        } else if (response.status === 403) {
          throw new Error(
            "Access denied. Check your Gemini API key permissions and quota."
          );
        } else if (response.status === 404) {
          throw new Error(
            "API endpoint not found. Please check the Gemini API configuration."
          );
        } else {
          throw new Error(
            `Gemini API request failed: ${response.status} ${response.statusText}`
          );
        }
      }

      const data = await response.json();
      console.log("Gemini API response:", data);

      if (
        !data.candidates ||
        !data.candidates[0] ||
        !data.candidates[0].content
      ) {
        throw new Error("Invalid response format from Gemini API");
      }

      const content = data.candidates[0].content.parts[0].text.trim();
      console.log("Gemini categorization content:", content);

      // Try to parse the JSON response
      let categorization;
      try {
        categorization = JSON.parse(content);
      } catch (parseError) {
        // If the response isn't pure JSON, try to extract JSON from it
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          categorization = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Could not parse JSON from Gemini response");
        }
      }

      // Validate that the categorization is in the expected format
      if (typeof categorization !== "object" || categorization === null) {
        throw new Error("Gemini returned invalid categorization format");
      }

      // Ensure all item names in the categorization actually exist in our items list
      const itemNameSet = new Set(items.map((item) => item.name));
      const validatedCategorization = {};

      for (const [category, itemList] of Object.entries(categorization)) {
        if (Array.isArray(itemList)) {
          const validItems = itemList.filter((itemName) =>
            itemNameSet.has(itemName)
          );
          if (validItems.length > 0) {
            validatedCategorization[category] = validItems;
          }
        }
      }

      console.log("Validated categorization:", validatedCategorization);
      return validatedCategorization;
    } catch (error) {
      console.error("Gemini categorization failed:", error);
      throw new Error(`Categorization failed: ${error.message}`);
    }
  };

  const testGeminiConnection = async () => {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Hello, test message. Please respond with 'API key is working'.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 20,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.candidates && data.candidates[0]) {
          console.log("✓ Gemini API connection successful");
          return true;
        }
      }

      console.log("❌ Gemini API connection failed");
      return false;
    } catch (error) {
      console.error("❌ Gemini API test error:", error);
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError("Please enter a valid funeral home website URL");
      return;
    }

    // Test Gemini API connection first
    console.log("Testing Gemini API connection...");
    const isGeminiWorking = await testGeminiConnection();
    if (!isGeminiWorking) {
      setError(
        "Gemini API connection failed. Please check your API key and try again."
      );
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);
    setCurrentStep("loading");

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        "https://pricelistbackend.onrender.com";
      const response = await fetch(`${apiUrl}/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          max_pages: maxPages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to scrape funeral home website"
        );
      }

      setResults(data);
      setFuneralHomeName(extractFuneralHomeName(url));
      setCurrentStep("calculator");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while analyzing the funeral home website"
      );
      setCurrentStep("input");
    } finally {
      setLoading(false);
    }
  };

  const extractFuneralHomeName = (url) => {
    try {
      const domain = new URL(url).hostname.replace("www.", "");
      return domain
        .split(".")[0]
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    } catch {
      return "Funeral Home";
    }
  };

  const parseFormattedPrices = async (formattedPrices) => {
    if (!formattedPrices) {
      throw new Error("No formatted prices data available");
    }

    const lines = formattedPrices.split("\n");
    const items = [];
    const uniqueItems = new Map();

    for (const line of lines) {
      const match = line.match(/^(.+?):\s*\$?([\d,]+\.?\d*)\s*$/);
      if (match) {
        const [, name, price] = match;
        const cleanName = name.trim();
        const cleanPrice = parseFloat(price.replace(/[,$]/g, ""));

        if (cleanName && !isNaN(cleanPrice) && !uniqueItems.has(cleanName)) {
          const newItem = {
            id: cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            name: cleanName,
            price: cleanPrice,
          };
          items.push(newItem);
          uniqueItems.set(cleanName, newItem);
        }
      }
    }

    if (items.length === 0) {
      throw new Error("No valid items found in price data");
    }

    console.log("Parsed items for categorization:", items);

    try {
      // Use Gemini to categorize items
      const categorization = await categorizeWithGemini(items);

      // Organize items by category
      const groupedItems = {};
      for (const [categoryName, itemNames] of Object.entries(categorization)) {
        const categoryItems = items.filter((item) =>
          itemNames.includes(item.name)
        );
        if (categoryItems.length > 0) {
          groupedItems[categoryName] = categoryItems;
        }
      }

      // Handle any items that weren't categorized
      const categorizedItemNames = new Set(
        Object.values(categorization).flat()
      );
      const uncategorizedItems = items.filter(
        (item) => !categorizedItemNames.has(item.name)
      );

      if (uncategorizedItems.length > 0) {
        groupedItems["Other Services"] = [
          ...(groupedItems["Other Services"] || []),
          ...uncategorizedItems,
        ];
      }

      return groupedItems;
    } catch (categorizationError) {
      console.error("Categorization failed:", categorizationError);
      throw new Error(
        `AI categorization failed: ${categorizationError.message}`
      );
    }
  };

  const handleItemToggle = (itemId, item) => {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: prev[itemId] ? null : item,
    }));
  };

  const calculateTotal = () => {
    return Object.values(selectedItems).reduce((total, item) => {
      return total + (item ? item.price : 0);
    }, 0);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const generatePrintableEstimate = () => {
    const selectedItemsList = Object.values(selectedItems).filter(Boolean);
    const total = calculateTotal();

    return {
      funeralHome: funeralHomeName,
      website: url,
      date: new Date().toLocaleDateString(),
      items: selectedItemsList,
      total: total,
    };
  };

  const handlePrint = () => {
    const estimate = generatePrintableEstimate();

    const printContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="text-align: center; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
          Funeral Cost Estimate
        </h1>
        
        <div style="margin: 20px 0;">
          <p><strong>Funeral Home:</strong> ${estimate.funeralHome}</p>
          <p><strong>Website:</strong> ${estimate.website}</p>
          <p><strong>Date:</strong> ${estimate.date}</p>
        </div>
        
        <h2 style="color: #1f2937; margin-top: 30px;">Selected Services & Products</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb;">Service/Product</th>
              <th style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${estimate.items
              .map(
                (item) => `
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${
                  item.name
                }</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatCurrency(
                  item.price
                )}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr style="background-color: #f9fafb; font-weight: bold;">
              <td style="padding: 12px; border-top: 2px solid #1f2937;">Total Estimated Cost</td>
              <td style="padding: 12px; text-align: right; border-top: 2px solid #1f2937;">${formatCurrency(
                estimate.total
              )}</td>
            </tr>
          </tfoot>
        </table>
        
        <p className="margin-top: 30px; font-size: 14px; color: #6b7280;">
          This estimate is based on the General Price List from ${
            estimate.funeralHome
          }. 
          Final costs may vary. Please contact the funeral home for confirmation.
        </p>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleEmail = () => {
    const estimate = generatePrintableEstimate();
    const itemsList = estimate.items
      .map((item) => `${item.name}: ${formatCurrency(item.price)}`)
      .join("\n");

    const emailBody = `Funeral Cost Estimate from ${estimate.funeralHome}

Date: ${estimate.date}
Website: ${estimate.website}

Selected Services & Products:
${itemsList}

Total Estimated Cost: ${formatCurrency(estimate.total)}

This estimate is based on your General Price List.
Please confirm pricing and availability.

Best regards`;

    const subject = `Funeral Cost Estimate - ${estimate.funeralHome}`;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailtoLink);
  };

  const startOver = () => {
    setCurrentStep("input");
    setResults(null);
    setSelectedItems({});
    setGroupedItems(null);
    setError("");
    setUrl("");
  };

  // FIXED: Loading state should show loading screen, not calculator
  if (currentStep === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-green-200 border-t-green-600 mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Analyzing Website
            </h2>
            <p className="text-gray-600 mb-6">
              Locating and processing price information...
            </p>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center justify-center gap-2">
                <span className="text-green-600">✓</span>
                <span>Scanning website pages</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-green-600">✓</span>
                <span>Locating PDF documents</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-green-600">✓</span>
                <span>Extracting pricing information</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="animate-pulse text-yellow-500">⏳</span>
                <span>Organizing services...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FIXED: Calculator state - show loading if items not yet grouped
  if (currentStep === "calculator" && results) {
    if (!groupedItems) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-200 border-t-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg">Organizing services...</p>
            </div>
          </div>
        </div>
      );
    }

    // FIXED: Actual calculator interface
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              Funeral Cost Calculator
            </h1>
            <p className="text-gray-600 mb-2">
              {funeralHomeName} • Organized Price List
            </p>
            <button
              onClick={startOver}
              className="text-green-600 hover:text-green-800 font-medium flex items-center gap-2 mx-auto transition-colors"
            >
              ← Analyze Different Funeral Home
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Services Selection */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
                <h2 className="text-2xl font-bold text-gray-900 mb-8">
                  Select Services & Products
                </h2>

                {Object.entries(groupedItems).map(
                  ([categoryName, categoryItems]) => (
                    <div key={categoryName} className="mb-10">
                      <h3 className="text-xl font-semibold text-gray-800 mb-6 pb-3 border-b-2 border-green-100">
                        {categoryName}
                      </h3>
                      <div className="space-y-3">
                        {categoryItems.map((item) => (
                          <div
                            key={item.id}
                            className={`border-2 rounded-xl p-5 cursor-pointer transition-all duration-200 ${
                              selectedItems[item.id]
                                ? "border-green-500 bg-green-50 shadow-md transform scale-[1.02]"
                                : "border-gray-200 hover:border-green-300 hover:shadow-sm"
                            }`}
                            onClick={() => handleItemToggle(item.id, item)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <input
                                  type="checkbox"
                                  checked={!!selectedItems[item.id]}
                                  onChange={() =>
                                    handleItemToggle(item.id, item)
                                  }
                                  className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                                />
                                <div>
                                  <h4 className="font-semibold text-gray-900 text-lg">
                                    {item.name}
                                  </h4>
                                </div>
                              </div>
                              <div className="text-xl font-bold text-gray-900">
                                {formatCurrency(item.price)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Cost Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    Cost Summary
                  </h2>

                  {Object.values(selectedItems).filter(Boolean).length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📋</div>
                      <p className="text-gray-500 text-lg">
                        Select services to see pricing
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4 mb-8">
                        {Object.values(selectedItems)
                          .filter(Boolean)
                          .map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between items-center py-2 border-b border-gray-100"
                            >
                              <span className="text-gray-700 flex-1 pr-3 font-medium">
                                {item.name}
                              </span>
                              <span className="text-gray-900 font-semibold">
                                {formatCurrency(item.price)}
                              </span>
                            </div>
                          ))}
                      </div>

                      <div className="border-t-2 border-gray-200 pt-6">
                        <div className="flex justify-between items-center mb-8">
                          <span className="text-xl font-bold text-gray-900">
                            Total Estimated Cost
                          </span>
                          <span className="text-3xl font-bold text-green-600">
                            {formatCurrency(calculateTotal())}
                          </span>
                        </div>

                        <div className="space-y-4">
                          <button
                            onClick={handlePrint}
                            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-4 px-6 rounded-lg hover:from-green-700 hover:to-green-800 flex items-center justify-center gap-3 font-semibold transition-all transform hover:scale-[1.02]"
                          >
                            <span className="text-lg">🖨️</span>
                            Print Estimate
                          </button>

                          <button
                            onClick={handleEmail}
                            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-4 px-6 rounded-lg hover:from-green-700 hover:to-green-800 flex items-center justify-center gap-3 font-semibold transition-all transform hover:scale-[1.02]"
                          >
                            <span className="text-lg">📧</span>
                            Email to Funeral Home
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Disclaimer */}
                <div className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-400 rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <span className="text-yellow-600 text-xl">⚠️</span>
                    <div className="text-sm text-yellow-800">
                      <p className="font-semibold mb-1">Important Notice</p>
                      <p>
                        This estimate is based on the General Price List. Final
                        costs may vary. Please contact the funeral home for
                        confirmation and detailed planning.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FIXED: Default input form state
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Funeral Cost Calculator
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Analyze funeral home pricing with intelligent service categorization
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-100">
          <div className="space-y-6">
            <div>
              <label
                htmlFor="url"
                className="block text-sm font-semibold text-gray-700 mb-3"
              >
                Funeral Home Website URL
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example-funeral-home.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-black text-lg transition-all"
                required
              />
            </div>

            <div>
              <label
                htmlFor="maxPages"
                className="block text-sm font-semibold text-gray-700 mb-3"
              >
                Max Pages to Search
              </label>
              <select
                id="maxPages"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="text-black w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg transition-all"
              >
                <option value={25}>25 pages (Fast)</option>
                <option value={50}>50 pages (Recommended)</option>
                <option value={100}>100 pages (Thorough)</option>
                <option value={200}>200 pages (Complete)</option>
              </select>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-4 px-6 rounded-lg hover:from-green-700 hover:to-green-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg font-semibold transition-all transform hover:scale-[1.02] disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <span className="inline-block animate-spin text-xl">⟳</span>
                  Analyzing Website...
                </>
              ) : (
                <>
                  <span className="text-xl">🔍</span>
                  Analyze Price List
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3">
              <span className="text-red-500 text-xl">⚠️</span>
              <div>
                <h3 className="text-red-800 font-semibold">Analysis Failed</h3>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
            {error.includes("API") && (
              <div className="mt-4 text-sm text-red-600">
                <p className="font-semibold mb-2">Common fixes:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>
                    Get a new API key from{" "}
                    <a
                      href="https://makersuite.google.com/app/apikey"
                      target="_blank"
                      className="underline hover:text-red-800"
                    >
                      Google AI Studio
                    </a>
                  </li>
                  <li>Check API access and quota settings</li>
                  <li>Verify environment variable configuration</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
