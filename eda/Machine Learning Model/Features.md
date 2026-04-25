# Features of Our Model to Predict Sale Price
<p>There are essentially infinite variables that we could have used in our machine learning model to predict sale price. However, we want the model to be fair and interpretable as well as accurate. We envision a user submitting a Right To Know request and scrutinizing our model. A user may wonder why seemingly irrelevant or even discriminatory information was incorporated into the model.</p>

<p>For this reason, we limited our model to objective information about the home itself, and a few common census statistics. We also filtered to only residential properties.</p>

<p>In our feature engineering, we drew on [previous work](https://musa-5080-fall-2025.github.io/portfolio-setup-demiyang12/midterm/appendix/Yuqing_Yang_appendix.html#phase-4-model-building) by MUSA students Jinyang Xu, Xinyuan Cui, and Yuqing Yang.</p>

## Features Included from OPA Data

<p>For a full list of the fields included in OPA's data, see [the metadata](https://metadata.phila.gov/#home/datasetdetails/5543865f20583086178c4ee5/representationdetails/55d624fdad35c7e854cb21a4/).</p>

### Sale Price

<p>This is our target. We used past sale prices to train the model. We filtered to sales from 2010 or later so as not to train on obsolete data. We filtered out values under $5,000 and over $2,000,000 to avoid having our model skewed by outliers or typos.</p>

### Total Livable Area (Log)

<p>The square footage of the home. Larger homes will have higher sale prices. We use the log of the livable area as the predictor rather than the area itself, to reflect the diminishing returns of additional area: adding 100 square feet to a small home will have a larger impact on its price than adding the same area to a large home, and using the log accounts for this effect. We filtered out areas under 100 feet, which are likely errors.</p>

### Number of Bathrooms

<p>The number of bathrooms in the home. More bathrooms will correlate with a higher sale price.</p>

### Interior Condition

<p>As the meta data from Open Data Philly explains, this is a numeric code assigned by OPA assessors to the state of the building. 0 is reserved for vacant or other non-applicable land, and after that, a higher number means the property is in worse condition. The maximum, 7, indicates that the home is structurally compromised. This variable is categorical or ordinal; it's not really the case that a home rated a 4 has "twice as much" of anything as one rated a 2 and we would not necessarily expect a linear relationship, though we would expect higher numbers to correlate with lower sale prices. We will treat each number as a different category.</p>

### Quality Grade

<p>Quality grade "relates to building workmanship and materials," according to OPA. Like interior condition, it is a categorical variable represented as a letter grade from D (worst quality, associated with lower sale price) to A+ (associated with higher sale price).</p>

<p>A few properties have numerical ratings instead of letter grades, because they were rated under an older system which does not cleanly map to the current system.</p>

### Garage Spaces

<p>More garage spaces is associated with a higher sale value.</p>

### Central Air

<p>A binary variable indicating whether the home has central air, which is strongly correlated with higher sale price.</p>

### Zip Code

<p>A categorical variable indicating the zip code where the property is located.</p>

## American Community Survey (Census) Data

### Median Household Income

<p>We expect homes in wealthier areas to have higher value.</p>

### Percent College Educated

<p>We expect homes in areas where more people have college degrees to have higher value.</p>

### Percent in Labor Force

<p>We expect homes in areas where more people are employed to have higher value.</p>

## Not Included

### Age of Home

Analysis shows that age of the home is not significantly linearly correlated with its sales price. *Squared* age shows a significant correlation, but this is not very interpretable for an average user.

### Number of Bedrooms and Total Rooms

<p>Because we already have total livable area included in our model, and want to avoid multicolinearity, we are not including the variables for bedrooms and total rooms. Bathrooms are an exception to this because they have outsized value compared to their square footage.</p>

### Local Amenities

<p>We could have looked at the proximity of homes to different amenities such as parks and hospitals. This scope was beyond the capacity of our current project, but could be a consideration for improving the model in the future.</p>

# Results
<p>The R^2 of our model is 0.5361. Including sale date as a predictor and including older homes in the training could improve the R^2, but it would reduce the actual accuracy of the model for our purpose, which is predicting current values--in these circumstances, an "overprediction" by our model could actually be an accurate prediction, if the last sale of the home was decades ago and it would sell for substantially more now.</p>
