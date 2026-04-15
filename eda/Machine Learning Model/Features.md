# Features of Our Model to Predict Sale Price
<p>There are essentially infinite variables that we could have used in our machine learning model to predict sale price. However, we want the model to be fair and interpretable as well as accurate. We envision a user submitting a Right To Know request and scrutinizing our model. A user may wonder why seemingly irrelevant or even discriminatory information was incorporated into the model.</p>

<p>For this reason, we limited our model to objective information about the home itself.</p>

<p>In our feature engineering, we drew on [previous work](https://musa-5080-fall-2025.github.io/portfolio-setup-demiyang12/midterm/appendix/Yuqing_Yang_appendix.html#phase-4-model-building) by MUSA students Jinyang Xu, Xinyuan Cui, and Yuqing Yang.</p>

## Features Included from OPA Data

<p>For a full list of the fields included in OPA's data, see [the metadata](https://metadata.phila.gov/#home/datasetdetails/5543865f20583086178c4ee5/representationdetails/55d624fdad35c7e854cb21a4/).</p>

### Sale Price

<p>This represents the price the home sold for most recently, and is critical to predicting what it would sell for now. We excluded sales under $5000 as likely nominal transfers rather than sales that would actually predict price, and excluded sales over $50,000,000 to filter out typos.</p>

### Sale Date

<p>The date of the most recent sale of the property. This is important because more recent sales will be closer to current values than older sales, so we will want our model to include the sale date.</p>

### Total Livable Area (Log)

<p>The square footage of the home. Larger homes will have higher sale prices. We use the log of the livable area as the predictor rather than the area itself, to reflect the diminishing returns of additional area: adding 100 square feet to a small home will have a larger impact on its price than adding the same area to a large home, and using the log accounts for this effect.</p>

### Number of Bathrooms

<p>The number of bathrooms in the home. More bathrooms will correlate with a higher sale price.</p>

### Interior Condition

<p>As the meta data from Open Data Philly explains, this is a numeric code assigned by OPA assessors to the state of the building. 0 is reserved for vacant or other non-applicable land, and after that, a higher number means the property is in worse condition. The maximum, 7, indicates that the home is structurally compromised. This variable is categorical or ordinal; it's not really the case that a home rated a 4 has "twice as much" of anything as one rated a 2 and we would not necessarily expect a linear relationship, though we would expect higher numbers to correlate with lower sale prices. We will treat each number as a different category.</p>

### Quality Grade

<p>Quality grade "relates to building workmanship and materials," according to OPA. Like interior condition, it is a categorical variable represented as a letter grade from D (worst quality, associated with lower sale price) to A+ (associated with higher sale price). In our data, some properties have numbers in the quality field instead of letter grade.</p>

<p>A few properties have numerical ratings instead of letter grades, because they were rated under an older system. Since these do not map to the current letter grade system, we will filter our data to only include the letter grades.</p>

### Garage Spaces

<p>More garage spaces is associated with a higher sale value.</p>

### Central Air

<p>A binary variable indicating whether the home has central air, which is strongly correlated with higher sale price.</p>

### Category Code
<p>Filtered to residential codes (single family, multifamily, and mixed use), a categorical variable showing the type of property. Since we are considering residential properties we did not want to train on vacant land or other nonresidential properties.</p>

## Not Included

### Age of Home

Analysis shows that age of the home is not significantly linearly correlated with its sales price. *Squared* age shows a significant correlation, but this is not very interpretable for an average user.

### Number of Bedrooms and Total Rooms

<p>Because we already have total livable area included in our model, and want to avoid multicolinearity, we are not including the variables for bedrooms and total rooms. Bathrooms are an exception to this because they have outsized value compared to their square footage.</p>

### Neighborhood Information

<p>Income of neighborhood residents and other demographic factors can significantly impact home prices, but our algorithm should be fair and not give different estimates for the same home for different demographic groups. So, we excluded this information.</p>

### Local Amenities

<p>We could have looked at the proximity of homes to different amenities such as parks and hospitals. This scope was beyond the capacity of our current project, but could be a consideration for improving the model in the future.</p>

# Summary
<p>The steps required to get from our raw data to features engineered for the model are:</p>
- Filter out sale_price under $5000
- Create a new variable that is the log of the livable area
- Filter out numeric quality grades from before the current letter grade system